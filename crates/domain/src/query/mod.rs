//! Running SQL: splitting a script into statements and streaming their results.

mod result;
mod split;

pub use result::{Column, PageOutcome, ResultSink, Row};
pub use split::{split_statements, Dialect, Span};
