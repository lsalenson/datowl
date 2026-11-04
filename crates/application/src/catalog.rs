//! Database explorer and editor completion, served from the session's side channel.

use std::sync::Arc;

use datowl_domain::{Error, NodeRef, ObjectRef, Result, Row, SchemaSnapshot, TreeNode};
use uuid::Uuid;

use crate::context::Context;

pub struct CatalogService {
    ctx: Arc<Context>,
}

impl CatalogService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    /// A dead session is dropped, so the next action reconnects.
    fn checked<T>(&self, connection: Uuid, result: Result<T>) -> Result<T> {
        if result.as_ref().is_err_and(Error::is_connection_lost) {
            self.ctx.sessions.remove(connection);
        }
        result
    }

    pub async fn children(&self, connection: Uuid, node: &NodeRef) -> Result<Vec<TreeNode>> {
        let result = self.ctx.sessions.get(connection)?.children(node).await;
        self.checked(connection, result)
    }

    pub async fn ddl(&self, connection: Uuid, object: &ObjectRef) -> Result<String> {
        let result = self.ctx.sessions.get(connection)?.ddl(object).await;
        self.checked(connection, result)
    }

    pub async fn completion_schema(&self, connection: Uuid) -> Result<SchemaSnapshot> {
        let result = self.ctx.sessions.get(connection)?.completion_schema().await;
        self.checked(connection, result)
    }

    /// Read-only query that leaves the grid's open result set alone (column profiling).
    pub async fn side_query(&self, connection: Uuid, sql: &str) -> Result<Vec<Row>> {
        let result = self.ctx.sessions.get(connection)?.side_query(sql).await;
        self.checked(connection, result)
    }
}
