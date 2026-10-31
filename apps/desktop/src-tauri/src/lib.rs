//! Datowl desktop shell, the interface layer: Tauri commands over the application's use
//! cases. This is also the composition root, the only place that picks concrete
//! adapters (store, engines) for the domain's ports.

mod commands;
mod error;
mod events;

use std::sync::Arc;

use datowl_application::{App, Engines};
use datowl_clickhouse::ClickhouseDriver;
use datowl_postgres::PostgresDriver;
use datowl_store::{LocalFiles, Projects};
use tauri::Manager;
use tracing_subscriber::EnvFilter;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let projects = Arc::new(Projects::open(app.path().app_data_dir()?)?);
            let engines = Engines::default().with(PostgresDriver).with(ClickhouseDriver);
            app.manage(App::new(projects, Arc::new(LocalFiles), engines)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connections::list_connections,
            commands::connections::save_connection,
            commands::connections::delete_connection,
            commands::connections::test_connection,
            commands::connections::connect,
            commands::connections::disconnect,
            commands::explorer::children,
            commands::explorer::ddl,
            commands::explorer::completion_schema,
            commands::explorer::side_query,
            commands::query::split_statements,
            commands::query::execute,
            commands::query::fetch_more,
            commands::query::close_result,
            commands::query::cancel,
            commands::consoles::list_consoles,
            commands::consoles::read_console,
            commands::consoles::write_console,
            commands::consoles::delete_console,
            commands::files::list_dir,
            commands::files::read_file,
            commands::files::write_file,
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::open_project,
            commands::projects::rename_project,
            commands::projects::delete_project,
            commands::projects::git_branches,
            commands::projects::datagrip_sources,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Datowl");
}
