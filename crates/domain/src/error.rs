#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// An error reported by the database server. `position` is a 1-based character
    /// offset into the statement, when the server provides one.
    #[error("{message}")]
    Database {
        message: String,
        position: Option<u32>,
    },
    #[error("{0}")]
    Connection(String),
    #[error("Not connected")]
    NotConnected,
    #[error("The result set is closed")]
    NoOpenResult,
    #[error("Cancelled by user")]
    Cancelled,
    #[error("{0} not found")]
    NotFound(String),
    /// The request breaks a domain rule (invalid name, forbidden path, …).
    #[error("{0}")]
    Invalid(String),
    /// Local persistence failed (file system, keychain).
    #[error("{0}")]
    Storage(String),
    #[error("{0}")]
    Other(String),
}

impl Error {
    pub fn position(&self) -> Option<u32> {
        match self {
            Self::Database { position, .. } => *position,
            _ => None,
        }
    }

    pub fn database(message: impl Into<String>) -> Self {
        Self::Database {
            message: message.into(),
            position: None,
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid(message.into())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
