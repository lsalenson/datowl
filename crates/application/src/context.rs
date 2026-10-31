use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use datowl_domain::{
    Driver, DriverKind, Error, ProjectFiles, ProjectRepository, ProjectStorage, Result, Session,
};
use uuid::Uuid;

use crate::sessions::SessionRegistry;

/// Database engines available to connect with, by kind.
#[derive(Clone, Default)]
pub struct Engines(HashMap<DriverKind, Arc<dyn Driver>>);

impl Engines {
    pub fn with(mut self, driver: impl Driver + 'static) -> Self {
        self.0.insert(driver.kind(), Arc::new(driver));
        self
    }

    pub(crate) fn get(&self, kind: DriverKind) -> Result<Arc<dyn Driver>> {
        self.0.get(&kind).cloned().ok_or_else(|| Error::Other(format!("No driver for {kind:?}")))
    }
}

/// State shared by every service.
pub(crate) struct Context {
    pub projects: Arc<dyn ProjectRepository>,
    pub files: Arc<dyn ProjectFiles>,
    pub engines: Engines,
    pub sessions: SessionRegistry,
    /// The open project and its storage; replaced when another project is opened.
    current: RwLock<(Uuid, ProjectStorage)>,
}

impl Context {
    pub fn open_last(projects: Arc<dyn ProjectRepository>, files: Arc<dyn ProjectFiles>, engines: Engines) -> Result<Self> {
        let last = projects.list().first().ok_or_else(|| Error::NotFound("Project".into()))?.id;
        let storage = projects.open(last)?;
        Ok(Self { projects, files, engines, sessions: SessionRegistry::default(), current: RwLock::new((last, storage)) })
    }

    pub fn project_id(&self) -> Uuid {
        self.current.read().expect("project lock poisoned").0
    }

    pub fn storage(&self) -> ProjectStorage {
        self.current.read().expect("project lock poisoned").1.clone()
    }

    /// Makes `id` the open project. Returns the previous project's sessions, to close.
    pub fn switch_project(&self, id: Uuid) -> Result<Vec<Arc<dyn Session>>> {
        let storage = self.projects.open(id)?;
        *self.current.write().expect("project lock poisoned") = (id, storage);
        Ok(self.sessions.reset())
    }
}
