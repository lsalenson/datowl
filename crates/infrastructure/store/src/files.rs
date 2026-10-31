//! The project folder on disk. Every path is canonicalized and must lie inside the
//! project root: the UI cannot read or write anything else.

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use datowl_domain::{DatagripFiles, Error, FileEntry, ProjectFiles, Result};

use crate::git;

const MAX_ENTRIES: usize = 5_000;
const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
const HIDDEN: &[&str] = &[".git", ".DS_Store"];

pub struct LocalFiles;

/// `path` canonicalized, if it lies inside `root`.
fn inside(root: &Path, path: &Path) -> Result<PathBuf> {
    let root = root.canonicalize().map_err(|e| io(root, e))?;
    let resolved = path.canonicalize().map_err(|e| io(path, e))?;
    if !resolved.starts_with(&root) {
        return Err(Error::invalid("Outside the project folder"));
    }
    Ok(resolved)
}

fn io(path: &Path, e: std::io::Error) -> Error {
    Error::Storage(format!("{}: {e}", path.display()))
}

impl ProjectFiles for LocalFiles {
    fn list_dir(&self, root: &Path, path: &Path) -> Result<Vec<FileEntry>> {
        let dir = inside(root, path)?;
        let mut entries: Vec<FileEntry> = fs::read_dir(&dir)
            .map_err(|e| io(&dir, e))?
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                if HIDDEN.contains(&name.as_str()) {
                    return None;
                }
                // Follow symlinks for the kind, so a linked folder expands like a folder.
                let is_dir = fs::metadata(entry.path()).is_ok_and(|m| m.is_dir());
                Some(FileEntry { name, path: entry.path(), is_dir })
            })
            .take(MAX_ENTRIES)
            .collect();
        entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(entries)
    }

    fn read_file(&self, root: &Path, path: &Path) -> Result<String> {
        let file = inside(root, path)?;
        let size = fs::metadata(&file).map_err(|e| io(&file, e))?.len();
        if size > MAX_FILE_BYTES {
            return Err(Error::invalid("File too large to open"));
        }
        let bytes = fs::read(&file).map_err(|e| io(&file, e))?;
        if bytes.contains(&0) {
            return Err(Error::invalid("Binary file"));
        }
        String::from_utf8(bytes).map_err(|_| Error::invalid("Not a UTF-8 text file"))
    }

    fn write_file(&self, root: &Path, path: &Path, text: &str) -> Result<()> {
        let file = inside(root, path)?;
        // Through a temporary file, so a crash never leaves the user's file half-written.
        let tmp = file.with_extension("datowl-tmp");
        let result = fs::File::create(&tmp)
            .and_then(|mut f| f.write_all(text.as_bytes()).and_then(|_| f.sync_all()))
            .and_then(|_| fs::rename(&tmp, &file));
        if result.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        result.map_err(|e| io(&file, e))
    }

    fn git_branch(&self, path: &Path) -> Option<String> {
        git::git_branch(path)
    }

    fn git_branches(&self, path: &Path) -> Vec<String> {
        git::git_branches(path)
    }

    fn datagrip_sources(&self, folder: &Path) -> Option<DatagripFiles> {
        let idea = folder.join(".idea");
        let data_sources = fs::read_to_string(idea.join("dataSources.xml")).ok()?;
        let local = fs::read_to_string(idea.join("dataSources.local.xml")).ok();
        Some(DatagripFiles { data_sources, local })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_paths_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.sql"), "select 1").unwrap();
        fs::write(dir.path().join("secret"), "x").unwrap();

        assert_eq!(LocalFiles.read_file(&root, &root.join("a.sql")).unwrap(), "select 1");
        assert!(LocalFiles.read_file(&root, &root.join("../secret")).is_err());
        LocalFiles.write_file(&root, &root.join("a.sql"), "select 2").unwrap();
        assert_eq!(fs::read_to_string(root.join("a.sql")).unwrap(), "select 2");
    }
}
