use serde::Serialize;

/// Error payload returned to the UI by every command.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub message: String,
    pub position: Option<u32>,
    /// The session is gone: the next action must reconnect.
    pub connection_lost: bool,
}

impl From<datowl_domain::Error> for CommandError {
    fn from(e: datowl_domain::Error) -> Self {
        Self { position: e.position(), connection_lost: e.is_connection_lost(), message: e.to_string() }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
