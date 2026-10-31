//! The open project's folder, for the Files tool window.

use std::path::PathBuf;

use datowl_application::App;
use datowl_domain::FileEntry;
use tauri::State;

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
