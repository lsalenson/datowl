//! The open project's folder, for the Files tool window. The UI cannot reach anything
//! outside that folder through this service.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use datowl_domain::{Error, FileEntry, Result};

use crate::context::Context;

pub struct FileService {
    ctx: Arc<Context>,
}

impl FileService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    fn root(&self) -> Result<PathBuf> {
        let project = self.ctx.projects.get(self.ctx.project_id())?;
        project.path.ok_or_else(|| Error::invalid("This project has no folder"))
    }

    pub fn list_dir(&self, path: &Path) -> Result<Vec<FileEntry>> {
        self.ctx.files.list_dir(&self.root()?, path)
    }

    pub fn read(&self, path: &Path) -> Result<String> {
        self.ctx.files.read_file(&self.root()?, path)
    }

    pub fn write(&self, path: &Path, text: &str) -> Result<()> {
        self.ctx.files.write_file(&self.root()?, path, text)
    }
}
