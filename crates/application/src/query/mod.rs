//! Statement execution. A run starts in the background and returns its id right away;
//! results stream through [`RunEvents`], and the run can be cancelled with that id.

mod batch;
mod events;
mod utf16;

use std::{sync::Arc, time::Instant};

use datowl_domain::{Dialect, Error, PageOutcome, Result};
use serde::Serialize;
use uuid::Uuid;

use crate::{context::Context, sessions::SessionRegistry};

use self::{batch::BatchingSink, utf16::Utf16Cursor};
pub use events::{RunEvent, RunEvents};

#[derive(Serialize)]
pub struct StatementRange {
    start: u32,
    end: u32,
}

pub struct QueryService {
    ctx: Arc<Context>,
}

impl QueryService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    /// Statement boundaries in UTF-16 offsets, for "run statement at caret".
    pub fn split_statements(&self, sql: &str, dialect: Dialect) -> Vec<StatementRange> {
        let mut cursor = Utf16Cursor::new(sql);
        datowl_domain::split_statements(sql, dialect)
            .iter()
            .map(|span| StatementRange { start: cursor.at(span.start), end: cursor.at(span.end) })
            .collect()
    }

    /// Runs a script statement by statement, stopping at the first error. Returns the run id.
    pub fn execute(&self, connection: Uuid, sql: String, page_size: usize, events: Arc<dyn RunEvents>) -> Result<u64> {
        let session = self.ctx.sessions.get(connection)?;
        let dialect = self.ctx.storage().data_sources.get(connection)?.driver.dialect();
        let (run_id, cancel) = self.ctx.sessions.start_run();
        self.ctx.sessions.forget_result(connection);
        let ctx = self.ctx.clone();

        tokio::spawn(async move {
            let sessions = &ctx.sessions;
            let started = Instant::now();
            let mut cancelled = false;
            let mut offsets = Utf16Cursor::new(&sql);

            for (index, span) in datowl_domain::split_statements(&sql, dialect).iter().enumerate() {
                let statement = span.slice(&sql);
                events.send(RunEvent::StatementStarted {
                    index,
                    sql: statement.to_owned(),
                    offset: offsets.at(span.start),
                });
                sessions.forget_result(connection);

                let statement_started = Instant::now();
                let mut sink = BatchingSink::new(events.clone(), index);
                let outcome = session.execute(statement, page_size, &cancel, &mut sink).await;
                sink.flush();
                let token = |page: &PageOutcome| page.has_more.then(|| sessions.open_result(connection));
                if !report(&*events, index, outcome, statement_started, token) {
                    cancelled = cancel.is_cancelled();
                    break;
                }
            }

            events.send(RunEvent::Finished { elapsed_ms: ms(started), cancelled });
            sessions.finish_run(run_id);
        });
        Ok(run_id)
    }

    /// Continues the result set identified by `result_token`. Returns the run id.
    pub fn fetch_more(&self, connection: Uuid, result_token: u64, page_size: usize, events: Arc<dyn RunEvents>) -> Result<u64> {
        if !self.ctx.sessions.is_open_result(connection, result_token) {
            return Err(Error::NoOpenResult);
        }
        let session = self.ctx.sessions.get(connection)?;
        let (run_id, cancel) = self.ctx.sessions.start_run();
        let ctx = self.ctx.clone();

        tokio::spawn(async move {
            let sessions: &SessionRegistry = &ctx.sessions;
            let started = Instant::now();
            let mut sink = BatchingSink::new(events.clone(), 0);
            let outcome = session.fetch_more(page_size, &cancel, &mut sink).await;
            sink.flush();
            let outcome = outcome.inspect(|page| {
                // Same result set: keep its token valid while it has rows left.
                if !page.has_more {
                    sessions.forget_result(connection);
                }
            });
            let token = move |page: &PageOutcome| page.has_more.then_some(result_token);
            let ok = report(&*events, 0, outcome, started, token);
            events.send(RunEvent::Finished { elapsed_ms: ms(started), cancelled: !ok && cancel.is_cancelled() });
            sessions.finish_run(run_id);
        });
        Ok(run_id)
    }

    /// Releases a result set the UI no longer shows, unless another one replaced it.
    pub async fn close_result(&self, connection: Uuid, result_token: u64) -> Result<()> {
        if !self.ctx.sessions.is_open_result(connection, result_token) {
            return Ok(());
        }
        self.ctx.sessions.forget_result(connection);
        self.ctx.sessions.get(connection)?.close_result().await
    }

    pub fn cancel(&self, run_id: u64) {
        self.ctx.sessions.cancel_run(run_id);
    }
}

/// Sends the outcome of a statement; returns `false` when the script must stop.
fn report(
    events: &dyn RunEvents,
    index: usize,
    outcome: Result<PageOutcome>,
    started: Instant,
    token: impl FnOnce(&PageOutcome) -> Option<u64>,
) -> bool {
    match outcome {
        Ok(page) => {
            let result_token = token(&page);
            events.send(RunEvent::StatementFinished {
                index,
                rows: page.rows,
                has_more: page.has_more,
                truncated: page.truncated,
                rows_affected: page.rows_affected,
                elapsed_ms: ms(started),
                result_token,
            });
            true
        }
        Err(e) => {
            events.send(RunEvent::Error { index, position: e.position(), message: e.to_string() });
            false
        }
    }
}

fn ms(since: Instant) -> f64 {
    since.elapsed().as_secs_f64() * 1000.0
}
