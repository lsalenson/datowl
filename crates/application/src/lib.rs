//! Datowl application layer: the use cases the UI triggers.
//!
//! Services depend only on the domain's ports; the desktop shell builds them with
//! concrete adapters (`App::new`) and exposes them as Tauri commands. One service per
//! bounded context, all sharing the same [`Context`](context::Context): the open project
//! and the live sessions.

mod catalog;
mod connections;
mod consoles;
mod context;
mod files;
mod projects;
mod query;
mod sessions;

use std::sync::Arc;

use datowl_domain::{ProjectFiles, ProjectRepository, Result};

pub use catalog::CatalogService;
pub use connections::ConnectionService;
pub use consoles::ConsoleService;
pub use context::Engines;
pub use files::FileService;
pub use projects::{ProjectEntry, ProjectList, ProjectService};
pub use query::{QueryService, RunEvent, RunEvents, StatementRange};

use crate::context::Context;

/// Every use case, wired to one set of adapters.
pub struct App {
    pub connections: ConnectionService,
    pub catalog: CatalogService,
    pub query: QueryService,
    pub projects: ProjectService,
    pub consoles: ConsoleService,
    pub files: FileService,
}

impl App {
    /// Reopens the most recently opened project.
    pub fn new(projects: Arc<dyn ProjectRepository>, files: Arc<dyn ProjectFiles>, engines: Engines) -> Result<Self> {
        let ctx = Arc::new(Context::open_last(projects, files, engines)?);
        Ok(Self {
            connections: ConnectionService::new(ctx.clone()),
            catalog: CatalogService::new(ctx.clone()),
            query: QueryService::new(ctx.clone()),
            projects: ProjectService::new(ctx.clone()),
            consoles: ConsoleService::new(ctx.clone()),
            files: FileService::new(ctx),
        })
    }
}
