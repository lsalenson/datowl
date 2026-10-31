use datowl_application::App;
use datowl_domain::{NodeRef, ObjectRef, Row, SchemaSnapshot, TreeNode};
use tauri::State;
use uuid::Uuid;

use crate::error::CommandResult;

#[tauri::command]
pub async fn children(app: State<'_, App>, id: Uuid, node: NodeRef) -> CommandResult<Vec<TreeNode>> {
    Ok(app.catalog.children(id, &node).await?)
}

#[tauri::command]
pub async fn ddl(app: State<'_, App>, id: Uuid, object: ObjectRef) -> CommandResult<String> {
    Ok(app.catalog.ddl(id, &object).await?)
}

#[tauri::command]
pub async fn completion_schema(app: State<'_, App>, id: Uuid) -> CommandResult<SchemaSnapshot> {
    Ok(app.catalog.completion_schema(id).await?)
}

#[tauri::command]
pub async fn side_query(app: State<'_, App>, id: Uuid, sql: String) -> CommandResult<Vec<Row>> {
    Ok(app.catalog.side_query(id, &sql).await?)
}
