//! PostgreSQL driver built on `tokio-postgres`.
//!
//! A session holds one connection for the explorer and completion, and each execution
//! channel has its own, so neither browsing nor another console waits behind a slow query.

mod error;
mod exec;
mod meta;

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use futures_util::StreamExt;
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio::sync::mpsc;
use tokio_postgres::{config::SslMode, AsyncMessage, Client, SimpleQueryMessage};
use datowl_domain::{
    CancellationToken, ConnectionConfig, Driver, DriverKind, Error, ExecChannel, NodeRef, ObjectRef,
    PageOutcome, Result, ResultSink, Row, SchemaSnapshot, Session, TlsMode, TreeNode,
};

use crate::{
    error::{connect_error, query_error},
    exec::ExecState,
};

/// Side queries share the explorer channel: a runaway one must not block it for long.
const SIDE_QUERY_TIMEOUT_S: u32 = 60;

pub struct PostgresDriver;

#[async_trait]
impl Driver for PostgresDriver {
    fn kind(&self) -> DriverKind {
        DriverKind::Postgres
    }

    async fn connect(&self, config: &ConnectionConfig, password: Option<&str>) -> Result<Arc<dyn Session>> {
        let mut pg = tokio_postgres::Config::new();
        pg.host(&config.host)
            .port(config.port)
            .user(&config.user)
            .application_name("Datowl")
            .connect_timeout(Duration::from_secs(10))
            .keepalives_idle(Duration::from_secs(60))
            .ssl_mode(match config.tls {
                TlsMode::Disable => SslMode::Disable,
                TlsMode::Prefer => SslMode::Prefer,
                // The connector below does the verifying: libpq's verify modes have no
                // equivalent in tokio-postgres, which only decides whether to use TLS.
                TlsMode::Require | TlsMode::VerifyCa | TlsMode::VerifyFull => SslMode::Require,
            });
        if !config.database.is_empty() {
            pg.dbname(&config.database);
        }
        if let Some(password) = password.filter(|p| !p.is_empty()) {
            pg.password(password);
        }

        let tls = TlsConnector::builder()
            .danger_accept_invalid_certs(matches!(config.tls, TlsMode::Prefer | TlsMode::Require))
            .danger_accept_invalid_hostnames(config.tls != TlsMode::VerifyFull)
            .build()
            .map_err(|e| Error::Connection(e.to_string()))?;
        let tls = MakeTlsConnector::new(tls);

        // The first console's connection opens now: its first run starts without delay,
        // and a server out of connections says so when connecting.
        let (spare, meta) = tokio::try_join!(
            PgChannel::open(&pg, tls.clone()),
            open_client(&pg, tls.clone(), None),
        )?;

        let row = meta
            .query_one("SELECT current_setting('server_version'), current_database()", &[])
            .await
            .map_err(connect_error)?;
        let version = format!("PostgreSQL {}", row.get::<_, String>(0));
        let database = row.get(1);

        Ok(Arc::new(PgSession {
            meta,
            config: pg,
            tls,
            version,
            database,
            spare: std::sync::Mutex::new(Some(spare)),
        }))
    }
}

async fn open_client(
    config: &tokio_postgres::Config,
    tls: MakeTlsConnector,
    notices: Option<mpsc::UnboundedSender<String>>,
) -> Result<Client> {
    let (client, mut connection) = config.connect(tls).await.map_err(connect_error)?;
    tokio::spawn(async move {
        let mut messages = futures_util::stream::poll_fn(move |cx| connection.poll_message(cx));
        while let Some(message) = messages.next().await {
            match message {
                Ok(AsyncMessage::Notice(notice)) => {
                    if let Some(tx) = &notices {
                        let _ = tx.send(format!("{}: {}", notice.severity(), notice.message()));
                    }
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("postgres connection closed: {e}");
                    break;
                }
            }
        }
    });
    Ok(client)
}

struct PgSession {
    meta: Client,
    config: tokio_postgres::Config,
    tls: MakeTlsConnector,
    version: String,
    database: String,
    spare: std::sync::Mutex<Option<PgChannel>>,
}

pub(crate) struct PgChannel {
    client: Client,
    tls: MakeTlsConnector,
    notices: std::sync::Mutex<mpsc::UnboundedReceiver<String>>,
    state: tokio::sync::Mutex<ExecState>,
}

#[async_trait]
impl Session for PgSession {
    fn server_version(&self) -> &str {
        &self.version
    }

    async fn open_channel(&self) -> Result<Arc<dyn ExecChannel>> {
        let spare = self.spare.lock().expect("spare channel lock poisoned").take();
        let channel = match spare {
            Some(channel) => channel,
            None => PgChannel::open(&self.config, self.tls.clone()).await?,
        };
        Ok(Arc::new(channel))
    }

    async fn children(&self, node: &NodeRef) -> Result<Vec<TreeNode>> {
        meta::children(&self.meta, &self.database, node).await
    }

    async fn ddl(&self, object: &ObjectRef) -> Result<String> {
        meta::ddl(&self.meta, object).await
    }

    async fn completion_schema(&self) -> Result<SchemaSnapshot> {
        meta::completion_schema(&self.meta).await
    }

    async fn side_query(&self, sql: &str) -> Result<Vec<Row>> {
        // One simple-query message runs as one implicit transaction, so the read-only
        // mode and the timeout end with it, and an error leaves nothing behind on the
        // explorer channel.
        let script = format!("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '{SIDE_QUERY_TIMEOUT_S}s'; {sql}");
        let messages = self.meta.simple_query(&script).await.map_err(|e| query_error(e, 0))?;
        Ok(messages
            .into_iter()
            .filter_map(|m| match m {
                SimpleQueryMessage::Row(row) => {
                    Some((0..row.len()).map(|i| row.get(i).map(str::to_owned)).collect())
                }
                _ => None,
            })
            .collect())
    }
}

#[async_trait]
impl ExecChannel for PgChannel {
    async fn execute(
        &self,
        sql: &str,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let mut state = tokio::select! {
            state = self.state.lock() => state,
            _ = cancel.cancelled() => return Err(Error::Cancelled),
        };
        let outcome = self.run_statement(&mut state, sql, page_size.max(1), cancel, sink).await;
        self.drain_notices(sink);
        outcome
    }

    async fn fetch_more(
        &self,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let mut state = tokio::select! {
            state = self.state.lock() => state,
            _ = cancel.cancelled() => return Err(Error::Cancelled),
        };
        if state.cursor.is_none() {
            return Err(Error::NoOpenResult);
        }
        let outcome = self.fetch_page(&mut state, page_size.max(1), cancel, sink).await;
        self.drain_notices(sink);
        outcome
    }

    async fn close_result(&self) -> Result<()> {
        let mut state = self.state.lock().await;
        self.close_cursor(&mut state).await;
        Ok(())
    }

    async fn close(&self) {
        let mut state = self.state.lock().await;
        self.close_cursor(&mut state).await;
    }
}

impl PgChannel {
    async fn open(config: &tokio_postgres::Config, tls: MakeTlsConnector) -> Result<Self> {
        let (notice_tx, notice_rx) = mpsc::unbounded_channel();
        let client = open_client(config, tls.clone(), Some(notice_tx)).await?;
        Ok(Self {
            client,
            tls,
            notices: std::sync::Mutex::new(notice_rx),
            state: tokio::sync::Mutex::new(ExecState::default()),
        })
    }

    fn drain_notices(&self, sink: &mut dyn ResultSink) {
        let mut notices = self.notices.lock().expect("notice receiver poisoned");
        while let Ok(notice) = notices.try_recv() {
            sink.notice(notice);
        }
    }
}
