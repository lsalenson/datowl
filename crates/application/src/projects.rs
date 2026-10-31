//! Projects: listing, creating and switching between them.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use datowl_domain::{DatagripFiles, Error, ProjectInfo, Result};
use serde::Serialize;
use uuid::Uuid;

use crate::context::Context;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    #[serde(flatten)]
    pub info: ProjectInfo,
    /// Git branch of the project folder, when it is a repository.
    pub branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectList {
    pub current: Uuid,
    /// Most recently opened first.
    pub projects: Vec<ProjectEntry>,
}

pub struct ProjectService {
    ctx: Arc<Context>,
}

impl ProjectService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    fn entry(&self, info: ProjectInfo) -> ProjectEntry {
        let branch = info.path.as_deref().and_then(|path| self.ctx.files.git_branch(path));
        ProjectEntry { info, branch }
    }

    pub fn list(&self) -> ProjectList {
        ProjectList {
            current: self.ctx.project_id(),
            projects: self.ctx.projects.list().into_iter().map(|info| self.entry(info)).collect(),
        }
    }

    pub fn create(&self, name: &str, path: Option<PathBuf>) -> Result<ProjectEntry> {
        if let Some(path) = &path {
            if !path.is_dir() {
                return Err(Error::invalid(format!("{} is not a folder", path.display())));
            }
        }
        let name = ProjectInfo::validate_name(name)?;
        Ok(self.entry(self.ctx.projects.create(name, path)?))
    }

    /// Makes `id` the open project; the previous project's sessions are closed.
    pub async fn open(&self, id: Uuid) -> Result<()> {
        if id == self.ctx.project_id() {
            return Ok(());
        }
        for session in self.ctx.switch_project(id)? {
            session.close().await;
        }
        Ok(())
    }

    pub fn rename(&self, id: Uuid, name: &str) -> Result<ProjectEntry> {
        let name = ProjectInfo::validate_name(name)?;
        Ok(self.entry(self.ctx.projects.rename(id, name)?))
    }

    pub fn delete(&self, id: Uuid) -> Result<()> {
        if id == self.ctx.project_id() {
            return Err(Error::invalid("Cannot delete the open project"));
        }
        self.ctx.projects.delete(id)
    }

    /// Local branches of the open project's repository.
    pub fn git_branches(&self) -> Vec<String> {
        let project = self.ctx.projects.get(self.ctx.project_id()).ok();
        project.and_then(|p| p.path).map(|path| self.ctx.files.git_branches(&path)).unwrap_or_default()
    }

    /// DataGrip data sources of a folder, to import them.
    pub fn datagrip_sources(&self, folder: &Path) -> Option<DatagripFiles> {
        self.ctx.files.datagrip_sources(folder)
    }
}
