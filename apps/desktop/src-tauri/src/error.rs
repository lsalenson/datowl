use serde::Serialize;

/// Error payload returned to the UI by every command.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub message: String,
    pub position: Option<u32>,
}

impl From<datowl_domain::Error> for CommandError {
    fn from(e: datowl_domain::Error) -> Self {
        Self { position: e.position(), message: e.to_string() }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
