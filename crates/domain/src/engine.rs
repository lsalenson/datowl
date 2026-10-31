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

/// A live connection to one data source.
///
/// Statements run one at a time. A query result stays open after its first page so
/// [`Session::fetch_more`] can page through it; running anything else closes it.
/// Explorer and completion calls go through a separate channel, so they never wait
/// behind a long-running statement.
#[async_trait]
pub trait Session: Send + Sync {
    fn server_version(&self) -> &str;

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

    async fn children(&self, node: &NodeRef) -> Result<Vec<TreeNode>>;

    async fn ddl(&self, object: &ObjectRef) -> Result<String>;

    async fn completion_schema(&self) -> Result<SchemaSnapshot>;

    /// Runs a read-only query on the explorer channel and returns every row. Used for
    /// column profiling, which must not close the result set the grid is paging through.
    async fn side_query(&self, sql: &str) -> Result<Vec<Row>>;

    async fn close(&self);
}
