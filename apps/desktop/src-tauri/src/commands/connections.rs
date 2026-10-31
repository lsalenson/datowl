use datowl_application::App;
use datowl_domain::ConnectionConfig;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::error::CommandResult;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectInfo {
    server_version: String,
}

#[tauri::command]
pub fn list_connections(app: State<'_, App>) -> Vec<ConnectionConfig> {
    app.connections.list()
}

/// `password: None` keeps the stored password.
#[tauri::command]
pub fn save_connection(app: State<'_, App>, config: ConnectionConfig, password: Option<String>) -> CommandResult<ConnectionConfig> {
    Ok(app.connections.save(config, password.as_deref())?)
}

#[tauri::command]
pub async fn delete_connection(app: State<'_, App>, id: Uuid) -> CommandResult<()> {
    Ok(app.connections.delete(id).await?)
}

/// Opens a throwaway session and reports the server version.
#[tauri::command]
pub async fn test_connection(app: State<'_, App>, config: ConnectionConfig, password: Option<String>) -> CommandResult<String> {
    Ok(app.connections.test(&config, password).await?)
}

/// `password` overrides the keychain, for data sources that do not save it.
#[tauri::command]
pub async fn connect(app: State<'_, App>, id: Uuid, password: Option<String>) -> CommandResult<ConnectInfo> {
    let server_version = app.connections.connect(id, password).await?;
    Ok(ConnectInfo { server_version })
}

#[tauri::command]
pub async fn disconnect(app: State<'_, App>, id: Uuid) -> CommandResult<()> {
    app.connections.disconnect(id).await;
    Ok(())
}
