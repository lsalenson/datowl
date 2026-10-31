use serde::Serialize;

use datowl_domain::{Column, Row};

/// Streamed to the UI while statements run.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RunEvent {
    StatementStarted {
        index: usize,
        sql: String,
        /// UTF-16 offset of the statement in the submitted text.
        offset: u32,
    },
    Columns {
        index: usize,
        columns: Vec<Column>,
    },
    Rows {
        index: usize,
        rows: Vec<Row>,
    },
    Notice {
        message: String,
    },
    StatementFinished {
        index: usize,
        rows: u64,
        has_more: bool,
        truncated: bool,
        rows_affected: Option<u64>,
        elapsed_ms: f64,
        /// Pass to `fetch_more` to read the next page.
        result_token: Option<u64>,
    },
    Error {
        index: usize,
        message: String,
        position: Option<u32>,
    },
    Finished {
        elapsed_ms: f64,
        cancelled: bool,
    },
}

/// Where a run's events go: the IPC channel of the editor that started it.
pub trait RunEvents: Send + Sync + 'static {
    fn send(&self, event: RunEvent);
}
