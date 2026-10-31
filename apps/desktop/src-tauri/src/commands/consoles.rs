use datowl_application::App;
use tauri::State;
use uuid::Uuid;

use crate::error::CommandResult;

#[tauri::command]
pub fn list_consoles(app: State<'_, App>, id: Uuid) -> CommandResult<Vec<String>> {
    Ok(app.consoles.list(id)?)
}

#[tauri::command]
pub fn read_console(app: State<'_, App>, id: Uuid, name: String) -> CommandResult<String> {
    Ok(app.consoles.read(id, &name)?)
}

#[tauri::command]
pub fn write_console(app: State<'_, App>, id: Uuid, name: String, text: String) -> CommandResult<()> {
    Ok(app.consoles.write(id, &name, &text)?)
}

#[tauri::command]
pub fn delete_console(app: State<'_, App>, id: Uuid, name: String) -> CommandResult<()> {
    Ok(app.consoles.delete(id, &name)?)
}
