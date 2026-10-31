//! Statement execution with server-side paging.
//!
//! Queries are wrapped in a cursor (`DECLARE … CURSOR FOR <query>`) and read one page at
//! a time with `FETCH`, so `SELECT * FROM huge_table` returns its first rows instantly
//! and never ships the rest over the wire. Rows travel in the simple-query text format:
//! every value arrives already rendered by the server, so no type decoding is needed.
//!
//! In autocommit mode a cursor needs a transaction: Datowl opens one, and commits it as
//! soon as the result is exhausted or anything else runs on the connection.

use futures_util::{pin_mut, StreamExt};
use tokio_postgres::{error::SqlState, SimpleQueryMessage};
use datowl_domain::{CancellationToken, Column, Error, PageOutcome, Result, ResultSink};

use crate::{
    error::{has_code, query_error},
    PgSession,
};

const CURSOR: &str = "datowl_cursor";
const DECLARE_PREFIX: &str = "DECLARE datowl_cursor NO SCROLL CURSOR FOR ";

#[derive(Default)]
pub(crate) struct ExecState {
    pub cursor: Option<OpenCursor>,
}

pub(crate) struct OpenCursor {
    /// Datowl began the transaction holding the cursor and must end it.
    owns_transaction: bool,
}

#[derive(Default)]
struct Streamed {
    rows: u64,
    truncated: bool,
    columns_sent: bool,
    affected: Option<u64>,
}

impl PgSession {
    pub(crate) async fn run_statement(
        &self,
        state: &mut ExecState,
        sql: &str,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        self.close_cursor(state).await;

        if can_use_cursor(sql) {
            match self.declare_cursor(sql, sink).await {
                Ok(owns_transaction) => {
                    state.cursor = Some(OpenCursor { owns_transaction });
                    return self.fetch_page(state, page_size, cancel, sink).await;
                }
                Err(Declare::Unsupported) => {}
                Err(Declare::Failed(e)) => return Err(e),
            }
        }

        let streamed = self.stream(sql, page_size as u64, true, cancel, sink).await?;
        Ok(PageOutcome {
            rows: streamed.rows,
            has_more: false,
            truncated: streamed.truncated,
            rows_affected: if streamed.columns_sent { None } else { streamed.affected },
        })
    }

    pub(crate) async fn fetch_page(
        &self,
        state: &mut ExecState,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome> {
        let fetch = format!("FETCH FORWARD {page_size} FROM {CURSOR}");
        match self.stream(&fetch, u64::MAX, false, cancel, sink).await {
            Ok(streamed) => {
                let has_more = streamed.rows == page_size as u64;
                if !has_more {
                    self.close_cursor(state).await;
                }
                Ok(PageOutcome { rows: streamed.rows, has_more, ..Default::default() })
            }
            Err(e) => {
                self.close_cursor(state).await;
                Err(e)
            }
        }
    }

    pub(crate) async fn close_cursor(&self, state: &mut ExecState) {
        let Some(cursor) = state.cursor.take() else { return };
        let sql = if cursor.owns_transaction {
            "CLOSE datowl_cursor; COMMIT"
        } else {
            "CLOSE datowl_cursor"
        };
        // A failed CLOSE means the transaction is aborted: roll back the one we opened.
        if self.exec.simple_query(sql).await.is_err() && cursor.owns_transaction {
            let _ = self.exec.simple_query("ROLLBACK").await;
        }
    }

    /// Declares the cursor and sends the column metadata. Returns whether Datowl had to
    /// open the surrounding transaction.
    async fn declare_cursor(&self, sql: &str, sink: &mut dyn ResultSink) -> std::result::Result<bool, Declare> {
        let declare = format!("{DECLARE_PREFIX}{sql}");
        // Pipelined: describing the query (for column types) costs no extra round trip.
        let (prepared, declared) = tokio::join!(self.exec.prepare(sql), self.exec.simple_query(&declare));

        // Both parse the same query; the prepare error is reported against the user's text.
        let statement = match prepared {
            Ok(statement) => statement,
            Err(e) => {
                if declared.is_ok() {
                    let _ = self.exec.simple_query("CLOSE datowl_cursor").await;
                }
                return Err(Declare::Failed(query_error(e, 0)));
            }
        };

        let owns_transaction = match declared {
            Ok(_) => false,
            Err(e) if has_code(&e, &SqlState::NO_ACTIVE_SQL_TRANSACTION) => {
                let begin = format!("BEGIN; {declare}");
                if let Err(e) = self.exec.simple_query(&begin).await {
                    let _ = self.exec.simple_query("ROLLBACK").await;
                    return Err(classify(e, char_len(&begin) - char_len(sql)));
                }
                true
            }
            Err(e) => return Err(classify(e, char_len(DECLARE_PREFIX))),
        };

        sink.columns(
            statement
                .columns()
                .iter()
                .map(|c| Column {
                    name: c.name().to_owned(),
                    type_name: c.type_().name().to_owned(),
                    numeric: is_numeric(c.type_().name()),
                })
                .collect(),
        );
        Ok(owns_transaction)
    }

    async fn stream(
        &self,
        sql: &str,
        limit: u64,
        send_columns: bool,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<Streamed> {
        let stream = self.exec.simple_query_raw(sql).await.map_err(|e| query_error(e, 0))?;
        // Created once: re-arming the cancellation future for every row is measurable.
        let cancelled = cancel.cancelled();
        pin_mut!(stream, cancelled);

        let mut out = Streamed::default();
        let mut cancel_sent = false;
        loop {
            let message = tokio::select! {
                biased;
                _ = &mut cancelled, if !cancel_sent => {
                    cancel_sent = true;
                    let _ = self.exec.cancel_token().cancel_query(self.tls.clone()).await;
                    continue;
                }
                message = stream.next() => message,
            };
            match message {
                None => break,
                Some(Ok(SimpleQueryMessage::Row(row))) => {
                    if out.rows < limit {
                        sink.row((0..row.len()).map(|i| row.get(i).map(str::to_owned)).collect());
                        out.rows += 1;
                    } else {
                        out.truncated = true;
                    }
                }
                Some(Ok(SimpleQueryMessage::RowDescription(columns))) => {
                    if send_columns && !out.columns_sent {
                        out.columns_sent = true;
                        sink.columns(
                            columns
                                .iter()
                                .map(|c| Column { name: c.name().to_owned(), type_name: String::new(), numeric: false })
                                .collect(),
                        );
                    }
                }
                Some(Ok(SimpleQueryMessage::CommandComplete(n))) => out.affected = Some(n),
                Some(Ok(_)) => {}
                Some(Err(e)) if cancel_sent && has_code(&e, &SqlState::QUERY_CANCELED) => return Err(Error::Cancelled),
                Some(Err(e)) => return Err(query_error(e, 0)),
            }
        }
        if cancel_sent {
            return Err(Error::Cancelled);
        }
        Ok(out)
    }
}

enum Declare {
    /// The statement cannot run inside a cursor; run it directly instead.
    Unsupported,
    Failed(Error),
}

fn classify(e: tokio_postgres::Error, shift: usize) -> Declare {
    if has_code(&e, &SqlState::FEATURE_NOT_SUPPORTED) {
        Declare::Unsupported
    } else {
        Declare::Failed(query_error(e, shift as u32))
    }
}

fn char_len(s: &str) -> usize {
    s.chars().count()
}

/// Read-only queries can be paged through a cursor. Data-modifying CTEs and
/// `SELECT … INTO` cannot, so anything that looks like one runs directly.
fn can_use_cursor(sql: &str) -> bool {
    let lower = sql.trim_start_matches(|c: char| c.is_whitespace() || c == '(').to_ascii_lowercase();
    let first = lower.split(|c: char| !c.is_ascii_alphabetic()).next().unwrap_or("");
    match first {
        "select" => !contains_word(&lower, "into"),
        "with" => !["insert", "update", "delete", "merge", "into"].iter().any(|w| contains_word(&lower, w)),
        "values" | "table" => true,
        _ => false,
    }
}

fn contains_word(haystack: &str, word: &str) -> bool {
    haystack
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .any(|token| token == word)
}

fn is_numeric(type_name: &str) -> bool {
    matches!(type_name, "int2" | "int4" | "int8" | "float4" | "float8" | "numeric" | "oid" | "money")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_eligibility() {
        assert!(can_use_cursor("select * from t"));
        assert!(can_use_cursor("(select 1) union (select 2)"));
        assert!(can_use_cursor("WITH x AS (SELECT 1) SELECT * FROM x"));
        assert!(can_use_cursor("values (1), (2)"));
        assert!(!can_use_cursor("select * into t2 from t"));
        assert!(!can_use_cursor("with d as (delete from t returning *) select * from d"));
        assert!(!can_use_cursor("insert into t values (1)"));
        assert!(!can_use_cursor("show search_path"));
        assert!(!can_use_cursor("explain select 1"));
        // Identifiers that merely contain a keyword stay pageable.
        assert!(can_use_cursor("select updated_at, intox from t"));
    }
}
