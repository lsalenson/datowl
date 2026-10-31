use std::path::PathBuf;

use datowl_application::{App, ProjectEntry, ProjectList};
use datowl_domain::DatagripFiles;
use tauri::State;
use uuid::Uuid;

use crate::error::CommandResult;

#[tauri::command]
pub fn list_projects(app: State<'_, App>) -> ProjectList {
    app.projects.list()
}

#[tauri::command]
pub fn create_project(app: State<'_, App>, name: String, path: Option<PathBuf>) -> CommandResult<ProjectEntry> {
    Ok(app.projects.create(&name, path)?)
}

/// Makes `id` the open project; the previous project's sessions are closed.
#[tauri::command]
pub async fn open_project(app: State<'_, App>, id: Uuid) -> CommandResult<()> {
    Ok(app.projects.open(id).await?)
}

#[tauri::command]
pub fn rename_project(app: State<'_, App>, id: Uuid, name: String) -> CommandResult<ProjectEntry> {
    Ok(app.projects.rename(id, &name)?)
}

#[tauri::command]
pub fn delete_project(app: State<'_, App>, id: Uuid) -> CommandResult<()> {
    Ok(app.projects.delete(id)?)
}

#[tauri::command]
pub fn git_branches(app: State<'_, App>) -> Vec<String> {
    app.projects.git_branches()
}

/// DataGrip's data source files of a project folder (`.idea/dataSources*.xml`), parsed by
/// the UI to import them.
#[tauri::command]
pub fn datagrip_sources(app: State<'_, App>, path: PathBuf) -> Option<DatagripFiles> {
    app.projects.datagrip_sources(&path)
}
