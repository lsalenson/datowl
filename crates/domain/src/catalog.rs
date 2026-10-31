//! Database explorer tree and completion metadata.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ObjectKind {
    Table,
    View,
    MaterializedView,
    Function,
}

/// A database object the UI can open, script or inspect.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectRef {
    pub database: String,
    /// Postgres schema; `None` for engines without schemas (ClickHouse).
    pub schema: Option<String>,
    pub name: String,
    pub kind: ObjectKind,
    /// Engine-specific identity, e.g. a Postgres function oid (functions overload by name).
    #[serde(default)]
    pub oid: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderKind {
    Tables,
    Views,
    MaterializedViews,
    Functions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ObjectFolderKind {
    Columns,
    Keys,
    Indexes,
}

/// Address of an expandable explorer node, sent back by the UI to list its children.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum NodeRef {
    Root,
    Database {
        database: String,
    },
    Schema {
        database: String,
        schema: String,
    },
    Folder {
        database: String,
        schema: Option<String>,
        folder: FolderKind,
    },
    Object {
        object: ObjectRef,
    },
    ObjectFolder {
        object: ObjectRef,
        folder: ObjectFolderKind,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NodeIcon {
    Database,
    Schema,
    Folder,
    Table,
    View,
    MaterializedView,
    Function,
    Column,
    PrimaryKeyColumn,
    Key,
    ForeignKey,
    Index,
    Check,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub label: String,
    pub detail: Option<String>,
    pub icon: NodeIcon,
    /// `Some` when the node can be expanded.
    pub node: Option<NodeRef>,
    /// `Some` when the node is an object that can be opened or scripted.
    pub object: Option<ObjectRef>,
}

impl TreeNode {
    pub fn leaf(label: impl Into<String>, detail: Option<String>, icon: NodeIcon) -> Self {
        Self {
            label: label.into(),
            detail,
            icon,
            node: None,
            object: None,
        }
    }

    pub fn branch(label: impl Into<String>, detail: Option<String>, icon: NodeIcon, node: NodeRef) -> Self {
        Self {
            label: label.into(),
            detail,
            icon,
            node: Some(node),
            object: None,
        }
    }

    pub fn object(object: ObjectRef, detail: Option<String>) -> Self {
        let icon = match object.kind {
            ObjectKind::Table => NodeIcon::Table,
            ObjectKind::View => NodeIcon::View,
            ObjectKind::MaterializedView => NodeIcon::MaterializedView,
            ObjectKind::Function => NodeIcon::Function,
        };
        let expandable = object.kind != ObjectKind::Function;
        Self {
            label: object.name.clone(),
            detail,
            icon,
            node: expandable.then(|| NodeRef::Object { object: object.clone() }),
            object: Some(object),
        }
    }
}

/// Everything the editor needs for completion, fetched once per connection.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSnapshot {
    /// Schema (Postgres) or database (ClickHouse) that unqualified names resolve to.
    pub default_schema: Option<String>,
    pub tables: Vec<TableInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    pub kind: ObjectKind,
    pub columns: Vec<ColumnInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
}
