//! `system.*` introspection: explorer tree, DDL and completion metadata.

use datowl_domain::{
    ColumnInfo, Error, FolderKind, NodeIcon, NodeRef, ObjectKind, ObjectRef, Result, Row,
    SchemaSnapshot, TableInfo, TreeNode,
};

use crate::{quote_ident, ChSession};

const VIEW_ENGINES: &str = "('View', 'MaterializedView', 'LiveView', 'WindowView')";
const SYSTEM_DATABASES: &str = "('system', 'INFORMATION_SCHEMA', 'information_schema')";

pub(crate) async fn children(session: &ChSession, node: &NodeRef) -> Result<Vec<TreeNode>> {
    match node {
        NodeRef::Root => {
            let rows = session
                .meta_query(
                    &format!("SELECT name FROM system.databases ORDER BY name IN {SYSTEM_DATABASES}, name"),
                    &[],
                )
                .await?;
            Ok(rows
                .into_iter()
                .map(|r| {
                    let database = text(&r, 0);
                    TreeNode::branch(database.clone(), None, NodeIcon::Database, NodeRef::Database { database })
                })
                .collect())
        }
        NodeRef::Database { database } => {
            let rows = session
                .meta_query(
                    &format!(
                        "SELECT countIf(engine NOT IN {VIEW_ENGINES}), countIf(engine IN {VIEW_ENGINES}) \
                         FROM system.tables WHERE database = {{db:String}} AND NOT is_temporary \
                         AND NOT startsWith(name, '.inner')"
                    ),
                    &[("param_db", database)],
                )
                .await?;
            let row = rows.first().ok_or_else(|| Error::Other("Empty response".into()))?;
            Ok([(FolderKind::Tables, "tables", text(row, 0)), (FolderKind::Views, "views", text(row, 1))]
                .into_iter()
                .filter(|(kind, _, count)| count != "0" || *kind == FolderKind::Tables)
                .map(|(folder, label, count)| {
                    TreeNode::branch(
                        label,
                        Some(count),
                        NodeIcon::Folder,
                        NodeRef::Folder { database: database.clone(), schema: None, folder },
                    )
                })
                .collect())
        }
        NodeRef::Folder { database, folder, .. } => {
            let views = if *folder == FolderKind::Views { "1" } else { "0" };
            let rows = session
                .meta_query(
                    &format!(
                        "SELECT name, engine FROM system.tables \
                         WHERE database = {{db:String}} AND NOT is_temporary AND NOT startsWith(name, '.inner') \
                           AND (engine IN {VIEW_ENGINES}) = {{views:UInt8}} ORDER BY name"
                    ),
                    &[("param_db", database), ("param_views", views)],
                )
                .await?;
            Ok(rows
                .into_iter()
                .map(|r| {
                    let engine = text(&r, 1);
                    let kind = match engine.as_str() {
                        "MaterializedView" => ObjectKind::MaterializedView,
                        "View" | "LiveView" | "WindowView" => ObjectKind::View,
                        _ => ObjectKind::Table,
                    };
                    TreeNode::object(
                        ObjectRef { database: database.clone(), schema: None, name: text(&r, 0), kind, oid: None },
                        Some(engine),
                    )
                })
                .collect())
        }
        NodeRef::Object { object } | NodeRef::ObjectFolder { object, .. } => {
            let rows = session
                .meta_query(
                    "SELECT name, type, is_in_primary_key FROM system.columns \
                     WHERE database = {db:String} AND table = {table:String} ORDER BY position",
                    &[("param_db", &object.database), ("param_table", &object.name)],
                )
                .await?;
            Ok(rows
                .into_iter()
                .map(|r| {
                    let icon = if text(&r, 2) == "1" { NodeIcon::PrimaryKeyColumn } else { NodeIcon::Column };
                    TreeNode::leaf(text(&r, 0), Some(text(&r, 1)), icon)
                })
                .collect())
        }
        NodeRef::Schema { .. } => Ok(Vec::new()),
    }
}

pub(crate) async fn ddl(session: &ChSession, object: &ObjectRef) -> Result<String> {
    let sql = format!("SHOW CREATE TABLE {}.{}", quote_ident(&object.database), quote_ident(&object.name));
    let rows = session.meta_query(&sql, &[]).await?;
    let ddl = rows.first().map(|r| text(r, 0)).unwrap_or_default();
    Ok(format!("{};\n", ddl.trim_end()))
}

pub(crate) async fn completion_schema(session: &ChSession) -> Result<SchemaSnapshot> {
    let rows = session
        .meta_query(
            &format!(
                "SELECT c.database, c.table, c.name, c.type, t.engine FROM system.columns c \
                 LEFT JOIN system.tables t ON t.database = c.database AND t.name = c.table \
                 WHERE c.database NOT IN {SYSTEM_DATABASES} \
                 ORDER BY c.database, c.table, c.position LIMIT 200000"
            ),
            &[],
        )
        .await?;

    let mut tables: Vec<TableInfo> = Vec::new();
    for row in &rows {
        let (schema, name) = (text(row, 0), text(row, 1));
        let column = ColumnInfo { name: text(row, 2), type_name: text(row, 3) };
        match tables.last_mut() {
            Some(t) if t.schema == schema && t.name == name => t.columns.push(column),
            _ => tables.push(TableInfo {
                kind: if text(row, 4).ends_with("View") { ObjectKind::View } else { ObjectKind::Table },
                schema,
                name,
                columns: vec![column],
            }),
        }
    }
    Ok(SchemaSnapshot { default_schema: Some(session.database().to_owned()), tables })
}

fn text(row: &Row, index: usize) -> String {
    row.get(index).cloned().flatten().unwrap_or_default()
}
