// Mirrors the serde types of the Rust side (crates/core and apps/desktop).

export type DriverKind = 'postgres' | 'clickhouse';
export type TlsMode = 'disable' | 'prefer' | 'require';
export type Dialect = DriverKind;

export interface ConnectionConfig {
  id: string;
  name: string;
  driver: DriverKind;
  host: string;
  port: number;
  user: string;
  database: string;
  tls: TlsMode;
  savePassword: boolean;
  color: string | null;
}

export interface Project {
  id: string;
  name: string;
  /** Folder the project belongs to (a repository, a DataGrip project). */
  path: string | null;
  /** Unix time in milliseconds. */
  lastOpened: number;
  /** Git branch of `path`, when it is a repository. */
  branch: string | null;
}

export interface ProjectList {
  current: string;
  /** Most recently opened first. */
  projects: Project[];
}

/** `.idea/dataSources.xml` and `.idea/dataSources.local.xml` of a DataGrip project. */
export interface DatagripFiles {
  dataSources: string;
  local: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface Column {
  name: string;
  typeName: string;
  numeric: boolean;
}

export type Row = (string | null)[];

export type RunEvent =
  | { kind: 'statementStarted'; index: number; sql: string; offset: number }
  | { kind: 'columns'; index: number; columns: Column[] }
  | { kind: 'rows'; index: number; rows: Row[] }
  | { kind: 'notice'; message: string }
  | {
      kind: 'statementFinished';
      index: number;
      rows: number;
      hasMore: boolean;
      truncated: boolean;
      rowsAffected: number | null;
      elapsedMs: number;
      resultToken: number | null;
    }
  | { kind: 'error'; index: number; message: string; position: number | null }
  | { kind: 'finished'; elapsedMs: number; cancelled: boolean };

export type ObjectKind = 'table' | 'view' | 'materializedView' | 'function';
export type FolderKind = 'tables' | 'views' | 'materializedViews' | 'functions';
export type ObjectFolderKind = 'columns' | 'keys' | 'indexes';

export interface ObjectRef {
  database: string;
  schema: string | null;
  name: string;
  kind: ObjectKind;
  oid: number | null;
}

export type NodeRef =
  | { type: 'root' }
  | { type: 'database'; database: string }
  | { type: 'schema'; database: string; schema: string }
  | { type: 'folder'; database: string; schema: string | null; folder: FolderKind }
  | { type: 'object'; object: ObjectRef }
  | { type: 'objectFolder'; object: ObjectRef; folder: ObjectFolderKind };

export type NodeIcon =
  | 'database'
  | 'schema'
  | 'folder'
  | 'table'
  | 'view'
  | 'materializedView'
  | 'function'
  | 'column'
  | 'primaryKeyColumn'
  | 'key'
  | 'foreignKey'
  | 'index'
  | 'check';

export interface TreeNode {
  label: string;
  detail: string | null;
  icon: NodeIcon;
  node: NodeRef | null;
  object: ObjectRef | null;
}

export interface SchemaSnapshot {
  defaultSchema: string | null;
  tables: TableInfo[];
}

export interface TableInfo {
  schema: string;
  name: string;
  kind: ObjectKind;
  columns: { name: string; typeName: string }[];
}

export interface StatementRange {
  start: number;
  end: number;
}

export interface CommandError {
  message: string;
  position: number | null;
}

export function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as CommandError).message);
  return String(e);
}
