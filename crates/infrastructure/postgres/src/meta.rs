//! Catalog introspection: explorer tree, DDL and completion metadata.

use std::fmt::Write;

use tokio_postgres::Client;
use datowl_domain::{
    ColumnInfo, Error, FolderKind, NodeIcon, NodeRef, ObjectFolderKind, ObjectKind, ObjectRef,
    Result, SchemaSnapshot, TableInfo, TreeNode,
};

use crate::error::query_error;

/// `$1`, `$2` (schema, name) resolved to a `regclass`, with identifiers quoted as needed.
const REGCLASS: &str = "format('%I.%I', $1::text, $2::text)::regclass";

pub(crate) async fn children(client: &Client, current_db: &str, node: &NodeRef) -> Result<Vec<TreeNode>> {
    match node {
        NodeRef::Root => databases(client, current_db).await,
        NodeRef::Database { database } if database == current_db => schemas(client, database).await,
        NodeRef::Database { .. } => Ok(Vec::new()),
        NodeRef::Schema { database, schema } => schema_folders(client, database, schema).await,
        NodeRef::Folder { database, schema: Some(schema), folder } => match folder {
            FolderKind::Functions => functions(client, database, schema).await,
            relation => relations(client, database, schema, *relation).await,
        },
        NodeRef::Folder { schema: None, .. } => Ok(Vec::new()),
        NodeRef::Object { object } => object_children(client, object).await,
        NodeRef::ObjectFolder { object, folder } => match folder {
            ObjectFolderKind::Columns => columns(client, object).await,
            ObjectFolderKind::Keys => keys(client, object).await,
            ObjectFolderKind::Indexes => indexes(client, object).await,
        },
    }
}

async fn databases(client: &Client, current_db: &str) -> Result<Vec<TreeNode>> {
    let rows = client
        .query(
            "SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn \
             ORDER BY datname <> current_database(), datname",
            &[],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            let name: String = r.get(0);
            if name == current_db {
                TreeNode::branch(name.clone(), None, NodeIcon::Database, NodeRef::Database { database: name })
            } else {
                TreeNode::leaf(name, None, NodeIcon::Database)
            }
        })
        .collect())
}

async fn schemas(client: &Client, database: &str) -> Result<Vec<TreeNode>> {
    let rows = client
        .query(
            // System schemas come last; the explorer hides them until chosen in its schema filter.
            "SELECT nspname FROM pg_namespace \
             WHERE nspname NOT LIKE 'pg\\_%' OR nspname = 'pg_catalog' \
             ORDER BY nspname IN ('pg_catalog', 'information_schema'), nspname <> 'public', nspname",
            &[],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            let schema: String = r.get(0);
            TreeNode::branch(
                schema.clone(),
                None,
                NodeIcon::Schema,
                NodeRef::Schema { database: database.to_owned(), schema },
            )
        })
        .collect())
}

async fn schema_folders(client: &Client, database: &str, schema: &str) -> Result<Vec<TreeNode>> {
    let row = client
        .query_one(
            "SELECT \
               count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p', 'f')), \
               count(c.oid) FILTER (WHERE c.relkind = 'v'), \
               count(c.oid) FILTER (WHERE c.relkind = 'm'), \
               (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = n.oid AND p.prokind IN ('f', 'p')) \
             FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid \
             WHERE n.nspname = $1 GROUP BY n.oid",
            &[&schema],
        )
        .await
        .map_err(err)?;

    let folders = [
        (FolderKind::Tables, "tables", row.get::<_, i64>(0)),
        (FolderKind::Views, "views", row.get(1)),
        (FolderKind::MaterializedViews, "materialized views", row.get(2)),
        (FolderKind::Functions, "routines", row.get(3)),
    ];
    Ok(folders
        .into_iter()
        .filter(|(kind, _, count)| *count > 0 || *kind == FolderKind::Tables)
        .map(|(folder, label, count)| {
            TreeNode::branch(
                label,
                Some(count.to_string()),
                NodeIcon::Folder,
                NodeRef::Folder { database: database.to_owned(), schema: Some(schema.to_owned()), folder },
            )
        })
        .collect())
}

async fn relations(client: &Client, database: &str, schema: &str, folder: FolderKind) -> Result<Vec<TreeNode>> {
    let (relkinds, kind): (&[&str], _) = match folder {
        FolderKind::Views => (&["v"], ObjectKind::View),
        FolderKind::MaterializedViews => (&["m"], ObjectKind::MaterializedView),
        _ => (&["r", "p", "f"], ObjectKind::Table),
    };
    let rows = client
        .query(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname = $1 AND c.relkind::text = ANY($2) ORDER BY c.relname",
            &[&schema, &relkinds],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            TreeNode::object(
                ObjectRef {
                    database: database.to_owned(),
                    schema: Some(schema.to_owned()),
                    name: r.get(0),
                    kind,
                    oid: None,
                },
                None,
            )
        })
        .collect())
}

async fn functions(client: &Client, database: &str, schema: &str) -> Result<Vec<TreeNode>> {
    let rows = client
        .query(
            "SELECT p.oid::int8, p.proname, pg_get_function_identity_arguments(p.oid), \
                    coalesce(pg_get_function_result(p.oid), 'procedure') \
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace \
             WHERE n.nspname = $1 AND p.prokind IN ('f', 'p') ORDER BY p.proname, 3",
            &[&schema],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            let name: String = r.get(1);
            let args: String = r.get(2);
            let mut node = TreeNode::object(
                ObjectRef {
                    database: database.to_owned(),
                    schema: Some(schema.to_owned()),
                    name: name.clone(),
                    kind: ObjectKind::Function,
                    oid: Some(r.get(0)),
                },
                Some(r.get(3)),
            );
            node.label = format!("{name}({args})");
            node
        })
        .collect())
}

async fn object_children(client: &Client, object: &ObjectRef) -> Result<Vec<TreeNode>> {
    if object.kind != ObjectKind::Table {
        return columns(client, object).await;
    }
    let (schema, name) = qualified(object)?;
    let row = client
        .query_one(
            &format!(
                "SELECT \
                   (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped), \
                   (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = r.oid AND k.contype <> 'n'), \
                   (SELECT count(*) FROM pg_index x WHERE x.indrelid = r.oid) \
                 FROM (SELECT {REGCLASS}::oid AS oid) r"
            ),
            &[&schema, &name],
        )
        .await
        .map_err(err)?;

    let folders = [
        (ObjectFolderKind::Columns, "columns", row.get::<_, i64>(0)),
        (ObjectFolderKind::Keys, "keys", row.get(1)),
        (ObjectFolderKind::Indexes, "indexes", row.get(2)),
    ];
    Ok(folders
        .into_iter()
        .filter(|(_, _, count)| *count > 0)
        .map(|(folder, label, count)| {
            TreeNode::branch(
                label,
                Some(count.to_string()),
                NodeIcon::Folder,
                NodeRef::ObjectFolder { object: object.clone(), folder },
            )
        })
        .collect())
}

async fn columns(client: &Client, object: &ObjectRef) -> Result<Vec<TreeNode>> {
    let (schema, name) = qualified(object)?;
    let rows = client
        .query(
            &format!(
                "SELECT a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, \
                        coalesce(a.attnum = ANY(k.conkey), false) \
                 FROM pg_attribute a \
                 LEFT JOIN pg_constraint k ON k.conrelid = a.attrelid AND k.contype = 'p' \
                 WHERE a.attrelid = {REGCLASS} AND a.attnum > 0 AND NOT a.attisdropped \
                 ORDER BY a.attnum"
            ),
            &[&schema, &name],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            let mut detail: String = r.get(1);
            if r.get::<_, bool>(2) {
                detail.push_str(" not null");
            }
            let icon = if r.get(3) { NodeIcon::PrimaryKeyColumn } else { NodeIcon::Column };
            TreeNode::leaf(r.get::<_, String>(0), Some(detail), icon)
        })
        .collect())
}

async fn keys(client: &Client, object: &ObjectRef) -> Result<Vec<TreeNode>> {
    let (schema, name) = qualified(object)?;
    let rows = client
        .query(
            &format!(
                "SELECT conname, contype::text, pg_get_constraintdef(oid) FROM pg_constraint \
                 WHERE conrelid = {REGCLASS} AND contype <> 'n' ORDER BY contype <> 'p', contype, conname"
            ),
            &[&schema, &name],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            let icon = match r.get::<_, &str>(1) {
                "p" | "u" => NodeIcon::Key,
                "f" => NodeIcon::ForeignKey,
                _ => NodeIcon::Check,
            };
            TreeNode::leaf(r.get::<_, String>(0), Some(r.get(2)), icon)
        })
        .collect())
}

async fn indexes(client: &Client, object: &ObjectRef) -> Result<Vec<TreeNode>> {
    let (schema, name) = qualified(object)?;
    let rows = client
        .query(
            &format!(
                "SELECT i.relname, pg_get_indexdef(i.oid) FROM pg_index x \
                 JOIN pg_class i ON i.oid = x.indexrelid WHERE x.indrelid = {REGCLASS} ORDER BY i.relname"
            ),
            &[&schema, &name],
        )
        .await
        .map_err(err)?;
    Ok(rows
        .iter()
        .map(|r| {
            let def: &str = r.get(1);
            let detail = def.split_once(" USING ").map_or(def, |(_, using)| using).to_owned();
            TreeNode::leaf(r.get::<_, String>(0), Some(detail), NodeIcon::Index)
        })
        .collect())
}

pub(crate) async fn ddl(client: &Client, object: &ObjectRef) -> Result<String> {
    match object.kind {
        ObjectKind::Table => table_ddl(client, object).await,
        ObjectKind::View | ObjectKind::MaterializedView => {
            let (schema, name) = qualified(object)?;
            let row = client
                .query_one(
                    &format!("SELECT format('%I.%I', $1::text, $2::text), pg_get_viewdef({REGCLASS}, true)"),
                    &[&schema, &name],
                )
                .await
                .map_err(err)?;
            let keyword = if object.kind == ObjectKind::View {
                "CREATE OR REPLACE VIEW"
            } else {
                "CREATE MATERIALIZED VIEW"
            };
            let body: String = row.get(1);
            let body = body.trim_end().trim_end_matches(';');
            Ok(format!("{keyword} {} AS\n{body};\n", row.get::<_, String>(0)))
        }
        ObjectKind::Function => {
            let oid = object.oid.ok_or_else(|| Error::Other("Function without oid".into()))?;
            let row = client
                .query_one("SELECT pg_get_functiondef(($1::int8)::oid)", &[&oid])
                .await
                .map_err(err)?;
            Ok(format!("{};\n", row.get::<_, String>(0).trim_end()))
        }
    }
}

async fn table_ddl(client: &Client, object: &ObjectRef) -> Result<String> {
    let (schema, name) = qualified(object)?;
    let params: [&(dyn tokio_postgres::types::ToSql + Sync); 2] = [&schema, &name];
    let head_sql = format!("SELECT format('%I.%I', $1::text, $2::text), obj_description({REGCLASS}, 'pg_class')");
    let columns_sql = format!(
        "SELECT quote_ident(a.attname), format_type(a.atttypid, a.atttypmod), a.attnotnull, \
                pg_get_expr(d.adbin, d.adrelid), a.attidentity::text, a.attgenerated::text \
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum \
         WHERE a.attrelid = {REGCLASS} AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum"
    );
    let constraints_sql = format!(
        "SELECT quote_ident(conname), pg_get_constraintdef(oid) FROM pg_constraint \
         WHERE conrelid = {REGCLASS} AND contype <> 'n' ORDER BY contype <> 'p', contype, conname"
    );
    let indexes_sql = format!(
        "SELECT pg_get_indexdef(x.indexrelid) FROM pg_index x WHERE x.indrelid = {REGCLASS} \
         AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid) ORDER BY 1"
    );
    let (head, cols, constraints, indexes) = tokio::try_join!(
        client.query_one(&head_sql, &params),
        client.query(&columns_sql, &params),
        client.query(&constraints_sql, &params),
        client.query(&indexes_sql, &params),
    )
    .map_err(err)?;

    let qualified_name: String = head.get(0);
    let width = cols.iter().map(|c| c.get::<_, &str>(0).len()).max().unwrap_or(0);
    let mut lines: Vec<String> = cols
        .iter()
        .map(|c| {
            let mut line = format!("    {:width$} {}", c.get::<_, &str>(0), c.get::<_, &str>(1));
            let default: Option<&str> = c.get(3);
            match (c.get::<_, &str>(4), c.get::<_, &str>(5)) {
                ("a", _) => line.push_str(" GENERATED ALWAYS AS IDENTITY"),
                ("d", _) => line.push_str(" GENERATED BY DEFAULT AS IDENTITY"),
                (_, "s") => {
                    let _ = write!(line, " GENERATED ALWAYS AS ({}) STORED", default.unwrap_or_default());
                }
                _ => {
                    if let Some(default) = default {
                        let _ = write!(line, " DEFAULT {default}");
                    }
                }
            }
            if c.get(2) {
                line.push_str(" NOT NULL");
            }
            line
        })
        .collect();
    lines.extend(
        constraints
            .iter()
            .map(|k| format!("    CONSTRAINT {} {}", k.get::<_, &str>(0), k.get::<_, &str>(1))),
    );

    let mut out = format!("CREATE TABLE {qualified_name}\n(\n{}\n);\n", lines.join(",\n"));
    for index in &indexes {
        let _ = write!(out, "\n{};\n", index.get::<_, &str>(0));
    }
    if let Some(comment) = head.get::<_, Option<&str>>(1) {
        let _ = write!(out, "\nCOMMENT ON TABLE {qualified_name} IS '{}';\n", comment.replace('\'', "''"));
    }
    Ok(out)
}

pub(crate) async fn completion_schema(client: &Client) -> Result<SchemaSnapshot> {
    let (schema, rows) = tokio::try_join!(
        client.query_one("SELECT current_schema()", &[]),
        client.query(
            "SELECT n.nspname, c.relname, c.relkind::text, a.attname, format_type(a.atttypid, a.atttypmod) \
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
             JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped \
             WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') \
               AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' \
             ORDER BY n.nspname, c.relname, a.attnum LIMIT 200000",
            &[],
        ),
    )
    .map_err(err)?;

    let mut tables: Vec<TableInfo> = Vec::new();
    for row in &rows {
        let (schema, name): (&str, &str) = (row.get(0), row.get(1));
        let column = ColumnInfo { name: row.get(3), type_name: row.get(4) };
        match tables.last_mut() {
            Some(t) if t.schema == schema && t.name == name => t.columns.push(column),
            _ => tables.push(TableInfo {
                schema: schema.to_owned(),
                name: name.to_owned(),
                kind: match row.get::<_, &str>(2) {
                    "v" => ObjectKind::View,
                    "m" => ObjectKind::MaterializedView,
                    _ => ObjectKind::Table,
                },
                columns: vec![column],
            }),
        }
    }
    Ok(SchemaSnapshot { default_schema: schema.get(0), tables })
}

fn qualified(object: &ObjectRef) -> Result<(&str, &str)> {
    let schema = object.schema.as_deref().ok_or_else(|| Error::Other("Postgres object without schema".into()))?;
    Ok((schema, object.name.as_str()))
}

fn err(e: tokio_postgres::Error) -> Error {
    query_error(e, 0)
}
