//! Datowl domain layer: the model, its rules, and the ports the outer layers implement.
//!
//! Nothing here performs I/O. Database engines implement [`Driver`] and [`Session`]
//! (`crates/infrastructure/postgres`, `…/clickhouse`); local persistence implements the
//! repository ports (`crates/infrastructure/store`); `crates/application` orchestrates
//! them into use cases.
//!
//! One module per bounded context:
//! - [`datasource`]: saved data sources and their credentials
//! - [`engine`]: the contract every database engine fulfils
//! - [`query`]: statements, result pages and SQL splitting
//! - [`catalog`]: explorer tree and completion metadata
//! - [`project`]: projects, their consoles and their folder

pub mod catalog;
pub mod datasource;
pub mod engine;
pub mod error;
pub mod project;
pub mod query;

pub use catalog::{
    ColumnInfo, FolderKind, NodeIcon, NodeRef, ObjectFolderKind, ObjectKind, ObjectRef,
    SchemaSnapshot, TableInfo, TreeNode,
};
pub use datasource::{ConnectionConfig, DataSourceRepository, DriverKind, TlsMode};
pub use engine::{Driver, Session};
pub use error::{Error, Result};
pub use project::{
    ConsoleRepository, DatagripFiles, FileEntry, ProjectFiles, ProjectInfo, ProjectRepository,
    ProjectStorage,
};
pub use query::{split_statements, Column, Dialect, PageOutcome, ResultSink, Row, Span};
pub use tokio_util::sync::CancellationToken;
