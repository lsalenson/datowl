use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::{
    ConnectionConfig, DriverKind, NodeRef, ObjectRef, PageOutcome, Result, ResultSink, Row,
    SchemaSnapshot, TreeNode,
};

#[async_trait]
pub trait Driver: Send + Sync {
    fn kind(&self) -> DriverKind;

    async fn connect(&self, config: &ConnectionConfig, password: Option<&str>) -> Result<Arc<dyn Session>>;
}

/// A live connection to one data source. It serves the explorer and completion, and
/// opens one [`ExecChannel`] per console, so neither ever waits behind a statement
/// running elsewhere. Dropping a session releases its connections.
#[async_trait]
pub trait Session: Send + Sync {
    fn server_version(&self) -> &str;

    /// Opens an independent execution context: its own transaction, settings and open
    /// result, on the server as well as here.
    async fn open_channel(&self) -> Result<Arc<dyn ExecChannel>>;

    async fn children(&self, node: &NodeRef) -> Result<Vec<TreeNode>>;

    async fn ddl(&self, object: &ObjectRef) -> Result<String>;

    async fn completion_schema(&self) -> Result<SchemaSnapshot>;

    /// Runs a read-only query on the explorer channel and returns every row. Used for
    /// column profiling, which must not disturb a result set being paged through.
    async fn side_query(&self, sql: &str) -> Result<Vec<Row>>;
}

/// Where a console runs its statements, one at a time. A query result stays open after
/// its first page so [`ExecChannel::fetch_more`] can page through it; running anything
/// else on the channel closes it.
#[async_trait]
pub trait ExecChannel: Send + Sync {
    /// Runs a single statement and streams up to `page_size` rows into `sink`.
    async fn execute(
        &self,
        sql: &str,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome>;

    /// Streams the next page of the open result set.
    async fn fetch_more(
        &self,
        page_size: usize,
        cancel: &CancellationToken,
        sink: &mut dyn ResultSink,
    ) -> Result<PageOutcome>;

    /// Releases the open result set, if any.
    async fn close_result(&self) -> Result<()>;

    /// Ends the open result cleanly. The channel's connection goes away when it is dropped.
    async fn close(&self);
}
