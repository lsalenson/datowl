//! The open project's folder, for the Files tool window.

use std::path::PathBuf;

use datowl_application::App;
use datowl_domain::FileEntry;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::CommandResult;

#[tauri::command]
pub fn list_dir(app: State<'_, App>, path: PathBuf) -> CommandResult<Vec<FileEntry>> {
    Ok(app.files.list_dir(&path)?)
}

#[tauri::command]
pub fn read_file(app: State<'_, App>, path: PathBuf) -> CommandResult<String> {
    Ok(app.files.read(&path)?)
}

#[tauri::command]
pub fn write_file(app: State<'_, App>, path: PathBuf, text: String) -> CommandResult<()> {
    Ok(app.files.write(&path, &text)?)
}

/// Asks where to save, then writes. The dialog stays on this side: the UI can never name
/// a path outside the project folder. Returns the chosen path, `None` when cancelled.
#[tauri::command]
pub async fn export_file(handle: AppHandle, app: State<'_, App>, name: String, text: String) -> CommandResult<Option<PathBuf>> {
    let dialog = handle.dialog().file().set_file_name(name);
    let Some(path) = dialog.blocking_save_file().and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };
    app.files.export(&path, &text)?;
    Ok(Some(path))
}
