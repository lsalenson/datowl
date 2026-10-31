use std::sync::Arc;

use datowl_application::{App, RunEvent, StatementRange};
use datowl_domain::Dialect;
use tauri::{ipc::Channel, State};
use uuid::Uuid;

use crate::{error::CommandResult, events::ChannelEvents};

/// Statement boundaries in UTF-16 offsets, for "run statement at caret".
#[tauri::command]
pub fn split_statements(app: State<'_, App>, sql: String, dialect: Dialect) -> Vec<StatementRange> {
    app.query.split_statements(&sql, dialect)
}

/// Returns the run id right away; results stream over `on_event`.
#[tauri::command]
pub async fn execute(
    app: State<'_, App>,
    connection_id: Uuid,
    sql: String,
    page_size: usize,
    on_event: Channel<RunEvent>,
) -> CommandResult<u64> {
    Ok(app.query.execute(connection_id, sql, page_size, Arc::new(ChannelEvents(on_event)))?)
}

/// Continues the result set identified by `result_token`.
#[tauri::command]
pub async fn fetch_more(
    app: State<'_, App>,
    connection_id: Uuid,
    result_token: u64,
    page_size: usize,
    on_event: Channel<RunEvent>,
) -> CommandResult<u64> {
    Ok(app.query.fetch_more(connection_id, result_token, page_size, Arc::new(ChannelEvents(on_event)))?)
}

/// Releases a result set the UI no longer shows, unless another one replaced it.
#[tauri::command]
pub async fn close_result(app: State<'_, App>, connection_id: Uuid, result_token: u64) -> CommandResult<()> {
    Ok(app.query.close_result(connection_id, result_token).await?)
}

#[tauri::command]
pub fn cancel(app: State<'_, App>, run_id: u64) {
    app.query.cancel(run_id);
}
