use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{query::Dialect, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DriverKind {
    Postgres,
    Clickhouse,
}

impl DriverKind {
    pub fn default_port(self) -> u16 {
        match self {
            Self::Postgres => 5432,
            Self::Clickhouse => 8123,
        }
    }

    pub fn dialect(self) -> Dialect {
        match self {
            Self::Postgres => Dialect::Postgres,
            Self::Clickhouse => Dialect::Clickhouse,
        }
    }
}

/// Transport security, following libpq's `sslmode` vocabulary.
/// For ClickHouse, `Require` switches the HTTP interface to HTTPS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TlsMode {
    #[default]
    Disable,
    Prefer,
    Require,
}

/// A saved data source. The password never lives here: it is kept in the OS keychain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: Uuid,
    pub name: String,
    pub driver: DriverKind,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub database: String,
    #[serde(default)]
    pub tls: TlsMode,
    #[serde(default = "default_true")]
    pub save_password: bool,
    #[serde(default)]
    pub color: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Data sources of the open project. Passwords are kept apart from the configuration
/// (the OS keychain), never in the saved file.
pub trait DataSourceRepository: Send + Sync {
    fn list(&self) -> Vec<ConnectionConfig>;

    fn get(&self, id: Uuid) -> Result<ConnectionConfig>;

    /// Inserts or replaces a data source. `password: None` keeps the stored one; a data
    /// source that does not save its password loses it.
    fn save(&self, config: ConnectionConfig, password: Option<&str>) -> Result<ConnectionConfig>;

    /// Deletes the data source with its password and consoles.
    fn delete(&self, id: Uuid) -> Result<()>;

    fn password(&self, id: Uuid) -> Result<Option<String>>;
}
