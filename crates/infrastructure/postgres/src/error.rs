use std::fmt::Write;

use tokio_postgres::error::{ErrorPosition, SqlState};
use datowl_domain::Error;

/// Converts a server error into the `[SQLSTATE] ERROR: message` form, with details.
/// `shift` is the number of characters Datowl prepended to the user's statement,
/// so the reported position points into the text the user actually wrote.
pub(crate) fn query_error(e: tokio_postgres::Error, shift: u32) -> Error {
    let Some(db) = e.as_db_error() else {
        return if e.is_closed() {
            Error::Connection("The connection to the server was closed".into())
        } else {
            Error::Other(e.to_string())
        };
    };

    let mut message = format!("[{}] {}: {}", db.code().code(), db.severity(), db.message());
    for (label, value) in [("Detail", db.detail()), ("Hint", db.hint()), ("Where", db.where_())] {
        if let Some(value) = value {
            let _ = write!(message, "\n  {label}: {value}");
        }
    }
    let position = match db.position() {
        Some(ErrorPosition::Original(p)) => p.checked_sub(shift).filter(|p| *p > 0),
        _ => None,
    };
    Error::Database { message, position }
}

pub(crate) fn connect_error(e: tokio_postgres::Error) -> Error {
    match e.as_db_error() {
        Some(db) => Error::Connection(format!("[{}] {}", db.code().code(), db.message())),
        None => Error::Connection(e.to_string()),
    }
}

pub(crate) fn has_code(e: &tokio_postgres::Error, code: &SqlState) -> bool {
    e.code() == Some(code)
}
