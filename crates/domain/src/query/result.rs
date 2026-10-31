use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    pub type_name: String,
    /// Right-align and colour as a number in the grid.
    pub numeric: bool,
}

/// One row, every value rendered as text (`None` is SQL NULL).
/// Text is what the grid displays, and both engines can produce it without decoding.
pub type Row = Vec<Option<String>>;

/// Receives a statement's results as they stream in.
pub trait ResultSink: Send {
    fn columns(&mut self, columns: Vec<Column>);
    fn row(&mut self, row: Row);
    fn notice(&mut self, message: String);
}

/// What one page of a statement produced.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageOutcome {
    /// Rows delivered to the sink by this call.
    pub rows: u64,
    /// The result set is still open and [`crate::Session::fetch_more`] can continue it.
    pub has_more: bool,
    /// Rows were dropped because the statement could not be paged.
    pub truncated: bool,
    pub rows_affected: Option<u64>,
}
