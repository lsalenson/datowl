//! Query consoles of the open project.

use std::sync::Arc;

use datowl_domain::{project::validate_console_name, Result};
use uuid::Uuid;

use crate::context::Context;

pub struct ConsoleService {
    ctx: Arc<Context>,
}

impl ConsoleService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    pub fn list(&self, data_source: Uuid) -> Result<Vec<String>> {
        self.ctx.storage().consoles.list(data_source)
    }

    pub fn read(&self, data_source: Uuid, name: &str) -> Result<String> {
        validate_console_name(name)?;
        self.ctx.storage().consoles.read(data_source, name)
    }

    pub fn write(&self, data_source: Uuid, name: &str, text: &str) -> Result<()> {
        validate_console_name(name)?;
        self.ctx.storage().consoles.write(data_source, name, text)
    }

    pub fn delete(&self, data_source: Uuid, name: &str) -> Result<()> {
        validate_console_name(name)?;
        self.ctx.storage().consoles.delete(data_source, name)
    }
}
