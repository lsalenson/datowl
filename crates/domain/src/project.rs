//! Projects: independent sets of data sources and consoles, optionally tied to a folder
//! (a repository, a DataGrip project), like DataGrip projects.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DataSourceRepository, Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: Uuid,
    pub name: String,
    /// Folder the project belongs to (a repository, a DataGrip project), if any.
    pub path: Option<PathBuf>,
    /// Unix time in milliseconds.
    pub last_opened: u64,
}

impl ProjectInfo {
    /// A project name, trimmed: non-empty and at most 128 bytes.
    pub fn validate_name(name: &str) -> Result<&str> {
        let name = name.trim();
        if name.is_empty() || name.len() > 128 {
            return Err(Error::invalid("Invalid project name"));
        }
        Ok(name)
    }
}

/// Everything stored for one project.
#[derive(Clone)]
pub struct ProjectStorage {
    pub data_sources: Arc<dyn DataSourceRepository>,
    pub consoles: Arc<dyn ConsoleRepository>,
}

pub trait ProjectRepository: Send + Sync {
    /// Projects, most recently opened first. Never empty.
    fn list(&self) -> Vec<ProjectInfo>;

    fn get(&self, id: Uuid) -> Result<ProjectInfo>;

    fn create(&self, name: &str, path: Option<PathBuf>) -> Result<ProjectInfo>;

    fn rename(&self, id: Uuid, name: &str) -> Result<ProjectInfo>;

    /// Deletes a project with its data sources (and their passwords) and consoles.
    fn delete(&self, id: Uuid) -> Result<()>;

    /// Marks the project as opened now and returns its storage.
    fn open(&self, id: Uuid) -> Result<ProjectStorage>;
}

/// Query consoles: named SQL scratch files, one set per data source.
pub trait ConsoleRepository: Send + Sync {
    /// Console names, sorted.
    fn list(&self, data_source: Uuid) -> Result<Vec<String>>;

    /// An unknown console reads as empty.
    fn read(&self, data_source: Uuid, name: &str) -> Result<String>;

    fn write(&self, data_source: Uuid, name: &str, text: &str) -> Result<()>;

    fn delete(&self, data_source: Uuid, name: &str) -> Result<()>;
}

/// A console name doubles as a file name: letters, digits, `_ - . space`, no leading dot.
pub fn validate_console_name(name: &str) -> Result<()> {
    let valid = !name.is_empty()
        && name.len() <= 128
        && name.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | ' ' | '.'))
        && !name.starts_with('.');
    if valid {
        Ok(())
    } else {
        Err(Error::invalid("Invalid console name"))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
}

/// DataGrip's data source files of a folder (`.idea/dataSources*.xml`), parsed by the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatagripFiles {
    pub data_sources: String,
    pub local: Option<String>,
}

/// The project folder on the user's machine. Every path must resolve inside `root`.
pub trait ProjectFiles: Send + Sync {
    /// Entries of a folder, folders first, hidden VCS files omitted.
    fn list_dir(&self, root: &Path, path: &Path) -> Result<Vec<FileEntry>>;

    /// A UTF-8 text file, refused when binary or too large.
    fn read_file(&self, root: &Path, path: &Path) -> Result<String>;

    /// Replaces a file atomically.
    fn write_file(&self, root: &Path, path: &Path, text: &str) -> Result<()>;

    /// Git branch checked out in `path` or its nearest parent repository.
    fn git_branch(&self, path: &Path) -> Option<String>;

    /// Local branches of the repository containing `path`, sorted.
    fn git_branches(&self, path: &Path) -> Vec<String>;

    /// Only `.idea/dataSources.xml` and `.idea/dataSources.local.xml` are ever read.
    fn datagrip_sources(&self, folder: &Path) -> Option<DatagripFiles>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(ProjectInfo::validate_name("  Prod  ").unwrap(), "Prod");
        assert!(ProjectInfo::validate_name("   ").is_err());
        assert!(validate_console_name("console 1").is_ok());
        assert!(validate_console_name("../etc/passwd").is_err());
        assert!(validate_console_name(".hidden").is_err());
    }
}
