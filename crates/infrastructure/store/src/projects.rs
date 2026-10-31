//! Projects: independent sets of data sources and consoles, like DataGrip projects.
//!
//! ```text
//! <app data>/projects.json            registry (name, optional folder, last opened)
//! <app data>/projects/<id>/           one Store per project (connections.json, consoles/)
//! ```

use std::{
    fs, io,
    path::PathBuf,
    sync::RwLock,
    time::{SystemTime, UNIX_EPOCH},
};

use datowl_domain::ProjectInfo;
use uuid::Uuid;

use crate::{write_atomic, Result, Store, StoreError};

pub struct Projects {
    root: PathBuf,
    list: RwLock<Vec<ProjectInfo>>,
}

impl Projects {
    /// Opens the registry, creating a first project on a fresh install. Data sources
    /// stored before projects existed (`<app data>/connections.json`) move into it.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        let list: Vec<ProjectInfo> = match fs::read(root.join("projects.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.into()),
        };
        let projects = Self { root, list: RwLock::new(list) };
        if projects.list().is_empty() {
            let first = projects.create("datowl", None)?;
            projects.adopt_legacy(first.id)?;
        }
        Ok(projects)
    }

    /// Projects, most recently opened first.
    pub fn list(&self) -> Vec<ProjectInfo> {
        let mut list = self.list.read().expect("projects lock poisoned").clone();
        list.sort_by(|a, b| b.last_opened.cmp(&a.last_opened));
        list
    }

    pub fn get(&self, id: Uuid) -> Result<ProjectInfo> {
        self.list().into_iter().find(|p| p.id == id).ok_or(StoreError::NotFound(id))
    }

    pub fn create(&self, name: &str, path: Option<PathBuf>) -> Result<ProjectInfo> {
        let name = ProjectInfo::validate_name(name).map_err(|_| StoreError::InvalidName)?;
        let project = ProjectInfo { id: Uuid::new_v4(), name: name.into(), path, last_opened: now() };
        fs::create_dir_all(self.dir(project.id))?;
        self.update(|list| list.push(project.clone()))?;
        Ok(project)
    }

    /// Marks the project as opened now and returns its store.
    pub fn open_project(&self, id: Uuid) -> Result<Store> {
        self.get(id)?;
        self.update(|list| {
            if let Some(p) = list.iter_mut().find(|p| p.id == id) {
                p.last_opened = now();
            }
        })?;
        Store::open(self.dir(id))
    }

    pub fn rename(&self, id: Uuid, name: &str) -> Result<ProjectInfo> {
        let name = ProjectInfo::validate_name(name).map_err(|_| StoreError::InvalidName)?;
        self.get(id)?;
        self.update(|list| {
            if let Some(p) = list.iter_mut().find(|p| p.id == id) {
                p.name = name.into();
            }
        })?;
        self.get(id)
    }

    /// Deletes a project with its data sources (and their keychain passwords) and consoles.
    pub fn delete(&self, id: Uuid) -> Result<()> {
        let store = Store::open(self.dir(id))?;
        for connection in store.connections() {
            store.delete_connection(connection.id)?;
        }
        self.update(|list| list.retain(|p| p.id != id))?;
        match fs::remove_dir_all(self.dir(id)) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn dir(&self, id: Uuid) -> PathBuf {
        self.root.join("projects").join(id.to_string())
    }

    fn update(&self, f: impl FnOnce(&mut Vec<ProjectInfo>)) -> Result<()> {
        let mut list = self.list.write().expect("projects lock poisoned");
        f(&mut list);
        write_atomic(&self.root.join("projects.json"), &serde_json::to_vec_pretty(&*list)?)
    }

    fn adopt_legacy(&self, id: Uuid) -> Result<()> {
        let dir = self.dir(id);
        for name in ["connections.json", "consoles"] {
            let from = self.root.join(name);
            if from.exists() {
                fs::rename(&from, dir.join(name))?;
            }
        }
        Ok(())
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_open_adopts_legacy_data_sources() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("connections.json"), "[]").unwrap();
        fs::create_dir_all(dir.path().join("consoles/x")).unwrap();

        let projects = Projects::open(dir.path()).unwrap();
        let [first] = projects.list().try_into().unwrap();
        assert!(!dir.path().join("connections.json").exists());
        assert!(dir.path().join(format!("projects/{}/connections.json", first.id)).exists());
        assert!(dir.path().join(format!("projects/{}/consoles/x", first.id)).exists());

        // Reopening keeps the same project and does not create another one.
        assert_eq!(Projects::open(dir.path()).unwrap().list(), [first]);
    }

    #[test]
    fn projects_are_listed_most_recent_first() {
        let dir = tempfile::tempdir().unwrap();
        let projects = Projects::open(dir.path()).unwrap();
        let a = projects.create("a", None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = projects.create("b", None).unwrap();
        assert_eq!(projects.list()[0].id, b.id);
        std::thread::sleep(std::time::Duration::from_millis(2));
        projects.open_project(a.id).unwrap();
        assert_eq!(projects.list()[0].id, a.id);

        projects.delete(b.id).unwrap();
        assert!(projects.list().iter().all(|p| p.id != b.id));
        assert!(matches!(projects.create("  ", None), Err(StoreError::InvalidName)));
    }
}
