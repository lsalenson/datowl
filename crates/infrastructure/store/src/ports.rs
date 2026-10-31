//! The domain's repository ports, implemented by [`Store`] and [`Projects`].

use std::{path::PathBuf, sync::Arc};

use datowl_domain::{
    ConnectionConfig, ConsoleRepository, DataSourceRepository, Error, ProjectInfo, ProjectRepository,
    ProjectStorage, Result,
};
use uuid::Uuid;

use crate::{Projects, Store, StoreError};

impl From<StoreError> for Error {
    fn from(e: StoreError) -> Self {
        match e {
            StoreError::NotFound(id) => Error::NotFound(format!("Data source {id}")),
            StoreError::InvalidName => Error::invalid(e.to_string()),
            other => Error::Storage(other.to_string()),
        }
    }
}

impl DataSourceRepository for Store {
    fn list(&self) -> Vec<ConnectionConfig> {
        self.connections()
    }

    fn get(&self, id: Uuid) -> Result<ConnectionConfig> {
        Ok(self.connection(id)?)
    }

    fn save(&self, config: ConnectionConfig, password: Option<&str>) -> Result<ConnectionConfig> {
        Ok(self.save_connection(config, password)?)
    }

    fn delete(&self, id: Uuid) -> Result<()> {
        Ok(self.delete_connection(id)?)
    }

    fn password(&self, id: Uuid) -> Result<Option<String>> {
        Ok(Store::password(self, id)?)
    }
}

impl ConsoleRepository for Store {
    fn list(&self, data_source: Uuid) -> Result<Vec<String>> {
        Ok(self.list_consoles(data_source)?)
    }

    fn read(&self, data_source: Uuid, name: &str) -> Result<String> {
        Ok(self.read_console(data_source, name)?)
    }

    fn write(&self, data_source: Uuid, name: &str, text: &str) -> Result<()> {
        Ok(self.write_console(data_source, name, text)?)
    }

    fn delete(&self, data_source: Uuid, name: &str) -> Result<()> {
        Ok(self.delete_console(data_source, name)?)
    }
}

impl ProjectRepository for Projects {
    fn list(&self) -> Vec<ProjectInfo> {
        Projects::list(self)
    }

    fn get(&self, id: Uuid) -> Result<ProjectInfo> {
        Ok(Projects::get(self, id)?)
    }

    fn create(&self, name: &str, path: Option<PathBuf>) -> Result<ProjectInfo> {
        Ok(Projects::create(self, name, path)?)
    }

    fn rename(&self, id: Uuid, name: &str) -> Result<ProjectInfo> {
        Ok(Projects::rename(self, id, name)?)
    }

    fn delete(&self, id: Uuid) -> Result<()> {
        Ok(Projects::delete(self, id)?)
    }

    fn open(&self, id: Uuid) -> Result<ProjectStorage> {
        let store = Arc::new(self.open_project(id)?);
        Ok(ProjectStorage { data_sources: store.clone(), consoles: store })
    }
}
