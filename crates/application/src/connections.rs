//! Data sources: saving them, testing them, and opening sessions on them.

use std::sync::Arc;

use datowl_domain::{ConnectionConfig, Result};
use uuid::Uuid;

use crate::context::Context;

pub struct ConnectionService {
    ctx: Arc<Context>,
}

impl ConnectionService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    pub fn list(&self) -> Vec<ConnectionConfig> {
        self.ctx.storage().data_sources.list()
    }

    /// `password: None` keeps the stored password.
    pub fn save(&self, config: ConnectionConfig, password: Option<&str>) -> Result<ConnectionConfig> {
        self.ctx.storage().data_sources.save(config, password)
    }

    pub async fn delete(&self, id: Uuid) -> Result<()> {
        self.disconnect(id).await;
        self.ctx.storage().data_sources.delete(id)
    }

    /// Opens a throwaway session and reports the server version. `password: None` uses
    /// the stored one.
    pub async fn test(&self, config: &ConnectionConfig, password: Option<String>) -> Result<String> {
        let password = match password {
            Some(password) => Some(password),
            None => self.ctx.storage().data_sources.password(config.id)?,
        };
        let session = self.ctx.engines.get(config.driver)?.connect(config, password.as_deref()).await?;
        let version = session.server_version().to_owned();
        session.close().await;
        Ok(version)
    }

    /// Connects and returns the server version. `password` overrides the keychain, for
    /// data sources that do not save it.
    pub async fn connect(&self, id: Uuid, password: Option<String>) -> Result<String> {
        let data_sources = self.ctx.storage().data_sources;
        let config = data_sources.get(id)?;
        let password = match password {
            Some(password) => Some(password),
            None if config.save_password => data_sources.password(id)?,
            None => None,
        };
        let session = self.ctx.engines.get(config.driver)?.connect(&config, password.as_deref()).await?;
        let server_version = session.server_version().to_owned();
        if let Some(previous) = self.ctx.sessions.insert(id, session) {
            previous.close().await;
        }
        Ok(server_version)
    }

    pub async fn disconnect(&self, id: Uuid) {
        if let Some(session) = self.ctx.sessions.remove(id) {
            session.close().await;
        }
    }
}
