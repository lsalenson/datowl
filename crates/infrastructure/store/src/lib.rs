//! Local persistence adapters: projects, their data sources, passwords, query consoles
//! and the project folder. Implements the domain's repository ports (see `ports`).
//!
//! ```text
//! <app data>/projects.json                       projects (see `projects`)
//! <project dir>/connections.json                 data sources (no secrets)
//! <project dir>/consoles/<id>/<name>.sql         console contents, one folder per data source
//! macOS Keychain, service "dev.datowl.app"      passwords, keyed by data source id
//! ```

mod files;
mod git;
mod ports;
mod projects;

pub use files::LocalFiles;
pub use git::{git_branch, git_branches};
pub use projects::Projects;

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::RwLock,
};

use uuid::Uuid;
use datowl_domain::ConnectionConfig;

const KEYCHAIN_SERVICE: &str = "dev.datowl.app";
/// Service the passwords were saved under before the app was renamed Datowl.
const LEGACY_KEYCHAIN_SERVICE: &str = "dev.datavio.app";

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("Corrupted data sources file: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Keychain error: {0}")]
    Keychain(#[from] keyring::Error),
    #[error("Unknown data source {0}")]
    NotFound(Uuid),
    #[error("Invalid name")]
    InvalidName,
}

pub type Result<T> = std::result::Result<T, StoreError>;

pub struct Store {
    dir: PathBuf,
    connections: RwLock<Vec<ConnectionConfig>>,
}

impl Store {
    pub fn open(dir: impl Into<PathBuf>) -> Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir)?;
        let connections = match fs::read(dir.join("connections.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.into()),
        };
        Ok(Self { dir, connections: RwLock::new(connections) })
    }

    pub fn connections(&self) -> Vec<ConnectionConfig> {
        self.connections.read().expect("store lock poisoned").clone()
    }

    pub fn connection(&self, id: Uuid) -> Result<ConnectionConfig> {
        self.connections
            .read()
            .expect("store lock poisoned")
            .iter()
            .find(|c| c.id == id)
            .cloned()
            .ok_or(StoreError::NotFound(id))
    }

    /// Inserts or replaces a data source. `password: None` keeps the stored one.
    pub fn save_connection(&self, config: ConnectionConfig, password: Option<&str>) -> Result<ConnectionConfig> {
        if !config.save_password {
            delete_password(config.id)?;
        } else if let Some(password) = password {
            entry(config.id)?.set_password(password)?;
        }

        let mut connections = self.connections.write().expect("store lock poisoned");
        match connections.iter_mut().find(|c| c.id == config.id) {
            Some(existing) => *existing = config.clone(),
            None => connections.push(config.clone()),
        }
        self.persist(&connections)?;
        Ok(config)
    }

    pub fn delete_connection(&self, id: Uuid) -> Result<()> {
        let mut connections = self.connections.write().expect("store lock poisoned");
        connections.retain(|c| c.id != id);
        self.persist(&connections)?;
        delete_password(id)?;
        match fs::remove_dir_all(self.consoles_dir(id)) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    pub fn password(&self, id: Uuid) -> Result<Option<String>> {
        if let Some(password) = read_password(&entry(id)?)? {
            return Ok(Some(password));
        }
        // Saved before the rename: move it under the current service.
        let legacy = keyring::Entry::new(LEGACY_KEYCHAIN_SERVICE, &id.to_string())?;
        let Some(password) = read_password(&legacy)? else { return Ok(None) };
        entry(id)?.set_password(&password)?;
        let _ = legacy.delete_credential();
        Ok(Some(password))
    }

    pub fn list_consoles(&self, id: Uuid) -> Result<Vec<String>> {
        let mut names: Vec<String> = match fs::read_dir(self.consoles_dir(id)) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().to_str()?.strip_suffix(".sql").map(str::to_owned))
                .collect(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.into()),
        };
        names.sort();
        Ok(names)
    }

    pub fn read_console(&self, id: Uuid, name: &str) -> Result<String> {
        match fs::read_to_string(self.console_path(id, name)?) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(String::new()),
            other => Ok(other?),
        }
    }

    pub fn write_console(&self, id: Uuid, name: &str, text: &str) -> Result<()> {
        let path = self.console_path(id, name)?;
        fs::create_dir_all(self.consoles_dir(id))?;
        write_atomic(&path, text.as_bytes())
    }

    pub fn delete_console(&self, id: Uuid, name: &str) -> Result<()> {
        match fs::remove_file(self.console_path(id, name)?) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn persist(&self, connections: &[ConnectionConfig]) -> Result<()> {
        write_atomic(&self.dir.join("connections.json"), &serde_json::to_vec_pretty(connections)?)
    }

    fn consoles_dir(&self, id: Uuid) -> PathBuf {
        self.dir.join("consoles").join(id.to_string())
    }

    fn console_path(&self, id: Uuid, name: &str) -> Result<PathBuf> {
        datowl_domain::project::validate_console_name(name).map_err(|_| StoreError::InvalidName)?;
        Ok(self.consoles_dir(id).join(format!("{name}.sql")))
    }
}

fn entry(id: Uuid) -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(KEYCHAIN_SERVICE, &id.to_string())?)
}

fn read_password(entry: &keyring::Entry) -> Result<Option<String>> {
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn delete_password(id: Uuid) -> Result<()> {
    let legacy = keyring::Entry::new(LEGACY_KEYCHAIN_SERVICE, &id.to_string())?;
    for entry in [entry(id)?, legacy] {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

/// Writes through a temporary file so a crash never leaves a half-written file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use datowl_domain::{DriverKind, TlsMode};

    fn config(name: &str) -> ConnectionConfig {
        ConnectionConfig {
            id: Uuid::new_v4(),
            name: name.into(),
            driver: DriverKind::Postgres,
            host: "localhost".into(),
            port: 5432,
            user: "postgres".into(),
            database: "postgres".into(),
            tls: TlsMode::Disable,
            save_password: false,
            color: None,
        }
    }

    #[test]
    fn connections_survive_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        let a = store.save_connection(config("a"), None).unwrap();
        let mut renamed = a.clone();
        renamed.name = "renamed".into();
        store.save_connection(renamed, None).unwrap();
        store.save_connection(config("b"), None).unwrap();

        let reopened = Store::open(dir.path()).unwrap();
        let names: Vec<_> = reopened.connections().into_iter().map(|c| c.name).collect();
        assert_eq!(names, ["renamed", "b"]);
    }

    #[test]
    fn consoles_round_trip_and_reject_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        let id = Uuid::new_v4();
        assert_eq!(store.read_console(id, "console").unwrap(), "");
        store.write_console(id, "console", "select 1;").unwrap();
        store.write_console(id, "console_1", "select 2;").unwrap();
        assert_eq!(store.read_console(id, "console").unwrap(), "select 1;");
        assert_eq!(store.list_consoles(id).unwrap(), ["console", "console_1"]);
        assert!(matches!(store.write_console(id, "../evil", ""), Err(StoreError::InvalidName)));
    }
}
