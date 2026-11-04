//! ClickHouse driver over the HTTP interface.
//!
//! Each execution channel runs in its own HTTP session (`session_id`) so `SET` and
//! temporary tables persist without consoles queueing behind each other on the server,
//! and results stream back as `TabSeparatedWithNamesAndTypes`. Paging keeps
//! the response open and reads further lines on demand: TCP backpressure pauses the
//! server meanwhile, and closing the response cancels the query.

mod meta;
mod tsv;

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use reqwest::{RequestBuilder, Response, StatusCode, Url};
use tokio::sync::Mutex;
use datowl_domain::{
    CancellationToken, Column, ConnectionConfig, Driver, DriverKind, Error, ExecChannel, NodeRef, ObjectRef,
    PageOutcome, Result, ResultSink, SchemaSnapshot, Session, TlsMode, TreeNode,
};

use crate::tsv::{is_exception_line, parse_row, LineReader};

const SESSION_LOCKED: &str = "Code: 373";

pub struct ClickhouseDriver;

#[async_trait]
impl Driver for ClickhouseDriver {
    fn kind(&self) -> DriverKind {
        DriverKind::Clickhouse
    }

    async fn connect(&self, config: &ConnectionConfig, password: Option<&str>) -> Result<Arc<dyn Session>> {
        let scheme = match config.tls {
            TlsMode::Disable | TlsMode::Prefer => "http",
            TlsMode::Require | TlsMode::VerifyCa | TlsMode::VerifyFull => "https",
        };
        let base = Url::parse(&format!("{scheme}://{}:{}/", config.host, config.port))
            .map_err(|e| Error::Connection(format!("Invalid host: {e}")))?;
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .tcp_nodelay(true)
            .danger_accept_invalid_hostnames(config.tls == TlsMode::VerifyCa)
            .build()
            .map_err(|e| Error::Connection(e.to_string()))?;

        let client = Arc::new(ChClient {
            http,
            base,
            user: config.user.clone(),
            password: password.unwrap_or_default().to_owned(),
            database: if config.database.is_empty() { "default".into() } else { config.database.clone() },
        });
        let rows = client
            .meta_query("SELECT version(), currentDatabase()", &[])
            .await
            .map_err(|e| Error::Connection(e.to_string()))?;
        let row = rows.into_iter().next().unwrap_or_default();
        let version = format!("ClickHouse {}", row.first().cloned().flatten().unwrap_or_default());
        Ok(Arc::new(ChSession { client, version }))
    }
}

struct ChClient {
    http: reqwest::Client,
    base: Url,
    user: String,
    password: String,
    database: String,
}

pub(crate) struct ChSession {
    client: Arc<ChClient>,
    version: String,
}

struct ChChannel {
    client: Arc<ChClient>,
    session_id: String,
    open: Mutex<Option<OpenResult>>,
}

struct OpenResult {
    reader: LineReader,
    query_id: String,
    /// Output in a user-chosen `FORMAT`: every line is shown as one text cell.
    raw: bool,
    columns: usize,
}

#[async_trait]
impl Session for ChSession {
    fn server_version(&self) -> &str {
        &self.version
    }

    async fn open_channel(&self) -> Result<Arc<dyn ExecChannel>> {
        Ok(Arc::new(ChChannel {
            client: self.client.clone(),
            session_id: uuid::Uuid::new_v4().to_string(),
            open: Mutex::new(None),
        }))
    }

    async fn children(&self, node: &NodeRef) -> Result<Vec<TreeNode>> {
        meta::children(self, node).await
    }

    async fn ddl(&self, object: &ObjectRef) -> Result<String> {
        meta::ddl(self, object).await
    }

    async fn completion_schema(&self) -> Result<SchemaSnapshot> {
        meta::completion_schema(self).await
    }

    async fn side_query(&self, sql: &str) -> Result<Vec<datowl_domain::Row>> {
        // readonly=2 rejects writes but still accepts the settings of the URL.
        self.meta_query(sql, &[("readonly", "2"), ("max_execution_time", "60")]).await
    }
}

impl ChSession {
    pub(crate) async fn meta_query(&self, sql: &str, params: &[(&str, &str)]) -> Result<Vec<datowl_domain::Row>> {
        self.client.meta_query(sql, params).await
    }

    pub(crate) fn database(&self) -> &str {
        &self.client.database
    }
}

#[async_trait]
impl ExecChannel for ChChannel {
    async fn execute(
        &self,
        sql: &str,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let mut open = tokio::select! {
            open = self.open.lock() => open,
            _ = cancel.cancelled() => return Err(Error::Cancelled),
        };
        self.close_open(&mut open).await;

        let query_id = uuid::Uuid::new_v4().to_string();
        let response = tokio::select! {
            response = self.send_statement(sql, &query_id) => response?,
            _ = cancel.cancelled() => {
                self.client.kill(&query_id).await;
                return Err(Error::Cancelled);
            }
        };
        let written = written_rows(&response);
        let mut reader = LineReader::new(response.bytes_stream());

        let raw = has_explicit_format(sql);
        let columns = if raw {
            vec![Column { name: "result".into(), type_name: "String".into(), numeric: false }]
        } else {
            match read_header(&mut reader).await? {
                Some(columns) => columns,
                // No result set: DDL, INSERT, SET, …
                None => return Ok(PageOutcome { rows_affected: written.filter(|n| *n > 0), ..Default::default() }),
            }
        };
        let count = columns.len();
        sink.columns(columns);
        *open = Some(OpenResult { reader, query_id, raw, columns: count });
        self.fetch_page(&mut open, page_size.max(1), cancel, sink).await
    }

    async fn fetch_more(
        &self,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let mut open = tokio::select! {
            open = self.open.lock() => open,
            _ = cancel.cancelled() => return Err(Error::Cancelled),
        };
        if open.is_none() {
            return Err(Error::NoOpenResult);
        }
        self.fetch_page(&mut open, page_size.max(1), cancel, sink).await
    }

    async fn close_result(&self) -> Result<()> {
        let mut open = self.open.lock().await;
        self.close_open(&mut open).await;
        Ok(())
    }

    async fn close(&self) {
        let mut open = self.open.lock().await;
        self.close_open(&mut open).await;
    }
}

impl ChChannel {
    async fn fetch_page(
        &self,
        slot: &mut Option<OpenResult>,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let open = slot.as_mut().ok_or(Error::NoOpenResult)?;
        let mut rows = 0u64;
        while rows < page_size as u64 {
            let line = tokio::select! {
                line = open.reader.next_line() => line,
                _ = cancel.cancelled() => {
                    self.close_open(slot).await;
                    return Err(Error::Cancelled);
                }
            };
            let range = match line {
                Ok(Some(range)) => range,
                Ok(None) => {
                    *slot = None;
                    return Ok(PageOutcome { rows, has_more: false, ..Default::default() });
                }
                Err(e) => {
                    *slot = None;
                    return Err(e);
                }
            };
            let line = open.reader.line(range);
            if open.raw {
                sink.row(vec![Some(String::from_utf8_lossy(line).into_owned())]);
            } else {
                let row = parse_row(line);
                if row.len() != open.columns && is_exception_line(line) {
                    let first = String::from_utf8_lossy(line).into_owned();
                    let message = format!("{first}\n{}", open.reader.rest().await);
                    *slot = None;
                    return Err(server_error(message.trim_start_matches("__exception__").trim()));
                }
                sink.row(row);
            }
            rows += 1;
        }
        Ok(PageOutcome { rows, has_more: true, ..Default::default() })
    }

    /// Drops the open response, which makes ClickHouse cancel the query, and kills it
    /// explicitly in case the server has not noticed the disconnect yet.
    async fn close_open(&self, slot: &mut Option<OpenResult>) {
        if let Some(open) = slot.take() {
            drop(open.reader);
            self.client.kill(&open.query_id).await;
        }
    }

    async fn send_statement(&self, sql: &str, query_id: &str) -> Result<Response> {
        // A killed query can hold the HTTP session for a moment; wait for it.
        for attempt in 0.. {
            let response = self
                .client
                .request(Some((query_id, &self.session_id)), &[("default_format", "TabSeparatedWithNamesAndTypes")])
                .body(sql.to_owned())
                .send()
                .await
                .map_err(transport_error)?;
            if response.status() == StatusCode::OK {
                return Ok(response);
            }
            let text = response.text().await.unwrap_or_default();
            if !text.starts_with(SESSION_LOCKED) || attempt == 30 {
                return Err(server_error(&text));
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        unreachable!()
    }
}

impl ChClient {
    async fn kill(&self, query_id: &str) {
        let _ = self
            .request(None, &[("param_id", query_id)])
            .body("KILL QUERY WHERE query_id = {id:String} ASYNC")
            .send()
            .await;
    }

    /// Runs a metadata query outside any console's session (sessions are single-threaded
    /// on the server) and returns every row.
    async fn meta_query(&self, sql: &str, params: &[(&str, &str)]) -> Result<Vec<datowl_domain::Row>> {
        let mut pairs = vec![("default_format", "TabSeparated")];
        pairs.extend_from_slice(params);
        let response = self.request(None, &pairs).body(sql.to_owned()).send().await.map_err(transport_error)?;
        let ok = response.status() == StatusCode::OK;
        let body = response.bytes().await.map_err(transport_error)?;
        if !ok {
            return Err(server_error(&String::from_utf8_lossy(&body)));
        }
        Ok(body
            .split(|&b| b == b'\n')
            .filter(|line| !line.is_empty())
            .map(parse_row)
            .collect())
    }

    fn request(&self, statement: Option<(&str, &str)>, params: &[(&str, &str)]) -> RequestBuilder {
        let mut url = self.base.clone();
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("database", &self.database)
                .append_pair("cancel_http_readonly_queries_on_client_close", "1");
            if let Some((query_id, session_id)) = statement {
                query
                    .append_pair("query_id", query_id)
                    .append_pair("session_id", session_id)
                    .append_pair("session_timeout", "3600");
            }
            for (key, value) in params {
                query.append_pair(key, value);
            }
        }
        self.http
            .post(url)
            .header("X-ClickHouse-User", &self.user)
            .header("X-ClickHouse-Key", &self.password)
    }
}

async fn read_header(reader: &mut LineReader) -> Result<Option<Vec<Column>>> {
    let Some(names) = reader.next_line().await? else { return Ok(None) };
    let names = parse_row(reader.line(names));
    let types = match reader.next_line().await? {
        Some(types) => parse_row(reader.line(types)),
        None => Vec::new(),
    };
    Ok(Some(
        names
            .into_iter()
            .enumerate()
            .map(|(i, name)| {
                let type_name = types.get(i).cloned().flatten().unwrap_or_default();
                Column { name: name.unwrap_or_default(), numeric: is_numeric(&type_name), type_name }
            })
            .collect(),
    ))
}

fn written_rows(response: &Response) -> Option<u64> {
    let summary = response.headers().get("X-ClickHouse-Summary")?.to_str().ok()?;
    let summary: serde_json::Value = serde_json::from_str(summary).ok()?;
    summary.get("written_rows")?.as_str()?.parse().ok()
}

/// `SELECT … FORMAT JSON` and friends: the user picked the output format.
fn has_explicit_format(sql: &str) -> bool {
    let lower = sql.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    lower.match_indices("format").any(|(i, _)| {
        let before_ok = i == 0 || !is_ident(bytes[i - 1]);
        let rest = &lower[i + "format".len()..];
        let after = rest.trim_start();
        before_ok
            && rest.len() != after.len()
            && after.as_bytes().first().is_some_and(|c| c.is_ascii_alphabetic())
    })
}

fn is_ident(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

fn is_numeric(type_name: &str) -> bool {
    let mut t = type_name;
    while let Some(inner) = t.strip_prefix("Nullable(").or_else(|| t.strip_prefix("LowCardinality(")) {
        t = inner.strip_suffix(')').unwrap_or(inner);
    }
    ["Int", "UInt", "Float", "Decimal"].iter().any(|p| t.starts_with(p))
}

fn server_error(text: &str) -> Error {
    let message = text.trim().to_owned();
    let position = message
        .find("failed at position ")
        .map(|i| &message[i + "failed at position ".len()..])
        .and_then(|rest| rest.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|digits| digits.parse().ok());
    Error::Database { message, position }
}

fn transport_error(e: reqwest::Error) -> Error {
    Error::ConnectionLost(e.to_string())
}

pub(crate) fn quote_ident(name: &str) -> String {
    format!("`{}`", name.replace('\\', "\\\\").replace('`', "\\`"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_format_detection() {
        assert!(has_explicit_format("SELECT 1 FORMAT JSON"));
        assert!(has_explicit_format("select * from t\nformat   Pretty"));
        assert!(!has_explicit_format("SELECT format('{}', 1)"));
        assert!(!has_explicit_format("SELECT formatted FROM t"));
        assert!(!has_explicit_format("SELECT 1"));
    }

    #[test]
    fn numeric_types() {
        assert!(is_numeric("UInt64"));
        assert!(is_numeric("Nullable(Decimal(18, 2))"));
        assert!(is_numeric("LowCardinality(Nullable(Int32))"));
        assert!(!is_numeric("String"));
        assert!(!is_numeric("Array(Int32)"));
    }

    #[test]
    fn error_position() {
        let e = server_error("Code: 62. DB::Exception: Syntax error: failed at position 8 ('frm'): frm t. (SYNTAX_ERROR)");
        assert_eq!(e.position(), Some(8));
    }
}
