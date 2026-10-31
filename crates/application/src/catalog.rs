//! Database explorer and editor completion, served from the session's side channel.

use std::sync::Arc;

use datowl_domain::{NodeRef, ObjectRef, Result, Row, SchemaSnapshot, TreeNode};
use uuid::Uuid;

use crate::context::Context;

pub struct CatalogService {
    ctx: Arc<Context>,
}

impl CatalogService {
    pub(crate) fn new(ctx: Arc<Context>) -> Self {
        Self { ctx }
    }

    pub async fn children(&self, connection: Uuid, node: &NodeRef) -> Result<Vec<TreeNode>> {
        self.ctx.sessions.get(connection)?.children(node).await
    }

    pub async fn ddl(&self, connection: Uuid, object: &ObjectRef) -> Result<String> {
        self.ctx.sessions.get(connection)?.ddl(object).await
    }

    pub async fn completion_schema(&self, connection: Uuid) -> Result<SchemaSnapshot> {
        self.ctx.sessions.get(connection)?.completion_schema().await
    }

    /// Read-only query that leaves the grid's open result set alone (column profiling).
    pub async fn side_query(&self, connection: Uuid, sql: &str) -> Result<Vec<Row>> {
        self.ctx.sessions.get(connection)?.side_query(sql).await
    }
}
