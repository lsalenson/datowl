//! PostgreSQL driver built on `tokio-postgres`.
//!
//! Each session holds two connections: one runs the user's statements, the other
//! serves the explorer and completion, so browsing never waits behind a slow query.

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
    CancellationToken, ConnectionConfig, Driver, DriverKind, Error, NodeRef, ObjectRef,
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
                TlsMode::Require => SslMode::Require,
            });
        if !config.database.is_empty() {
            pg.dbname(&config.database);
        }
        if let Some(password) = password.filter(|p| !p.is_empty()) {
            pg.password(password);
        }

        // Like libpq's `require`, encrypt without verifying the certificate chain.
        let tls = TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .build()
            .map_err(|e| Error::Connection(e.to_string()))?;
        let tls = MakeTlsConnector::new(tls);

        let (notice_tx, notice_rx) = mpsc::unbounded_channel();
        let (exec, meta) = tokio::try_join!(
            open_client(&pg, tls.clone(), Some(notice_tx)),
            open_client(&pg, tls.clone(), None),
        )?;

        let row = meta
            .query_one("SELECT current_setting('server_version'), current_database()", &[])
            .await
            .map_err(connect_error)?;
        let version = format!("PostgreSQL {}", row.get::<_, String>(0));
        let database = row.get(1);

        Ok(Arc::new(PgSession {
            exec,
            meta,
            tls,
            version,
            database,
            notices: std::sync::Mutex::new(notice_rx),
            state: tokio::sync::Mutex::new(ExecState::default()),
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

pub(crate) struct PgSession {
    exec: Client,
    meta: Client,
    tls: MakeTlsConnector,
    version: String,
    database: String,
    notices: std::sync::Mutex<mpsc::UnboundedReceiver<String>>,
    state: tokio::sync::Mutex<ExecState>,
}

#[async_trait]
impl Session for PgSession {
    fn server_version(&self) -> &str {
        &self.version
    }

    async fn execute(
        &self,
        sql: &str,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let mut state = self.state.lock().await;
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
        let mut state = self.state.lock().await;
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

    async fn close(&self) {
        let mut state = self.state.lock().await;
        self.close_cursor(&mut state).await;
    }
}

impl PgSession {
    fn drain_notices(&self, sink: &mut dyn ResultSink) {
        let mut notices = self.notices.lock().expect("notice receiver poisoned");
        while let Ok(notice) = notices.try_recv() {
            sink.notice(notice);
        }
    }
}
