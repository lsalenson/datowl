import type {
  ConnectionConfig,
  DatagripFiles,
  FileEntry,
  Project,
  ProjectList,
  Dialect,
  Row,
  NodeRef,
  ObjectRef,
  RunEvent,
  SchemaSnapshot,
  StatementRange,
  TreeNode,
} from './types';

/** Everything the UI asks of the Rust side. */
export interface Backend {
  listProjects(): Promise<ProjectList>;
  /** Problems met while loading (a damaged file set aside), once. */
  takeNotices(): Promise<string[]>;
  createProject(name: string, path: string | null): Promise<Project>;
  /** Makes `id` the open project; the previous project's sessions are closed. */
  openProject(id: string): Promise<void>;
  renameProject(id: string, name: string): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  /** Local branches of the open project's repository. */
  gitBranches(): Promise<string[]>;
  datagripSources(path: string): Promise<DatagripFiles | null>;

  /** Folders first; paths must lie inside the open project's folder. */
  listDir(path: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  /** Asks where to save, then writes. Resolves with the chosen path, null when cancelled. */
  exportFile(name: string, text: string): Promise<string | null>;

  listConnections(): Promise<ConnectionConfig[]>;
  /** `password: null` keeps the stored password. */
  saveConnection(config: ConnectionConfig, password: string | null): Promise<ConnectionConfig>;
  deleteConnection(id: string): Promise<void>;
  testConnection(config: ConnectionConfig, password: string | null): Promise<string>;
  connect(id: string, password: string | null): Promise<{ serverVersion: string }>;
  disconnect(id: string): Promise<void>;

  children(id: string, node: NodeRef): Promise<TreeNode[]>;
  ddl(id: string, object: ObjectRef): Promise<string>;
  completionSchema(id: string): Promise<SchemaSnapshot>;
  /** Read-only query on the explorer channel (column profiling); returns every row. */
  sideQuery(id: string, sql: string): Promise<Row[]>;

  splitStatements(sql: string, dialect: Dialect): Promise<StatementRange[]>;
  /** Runs on `channel`: each console has its own transaction, settings and open result. */
  execute(connectionId: string, channel: string, sql: string, pageSize: number, onEvent: (e: RunEvent) => void): Promise<number>;
  fetchMore(
    connectionId: string,
    channel: string,
    resultToken: number,
    pageSize: number,
    onEvent: (e: RunEvent) => void,
  ): Promise<number>;
  /** Releases a result set kept open for paging, if it is still the current one. */
  closeResult(connectionId: string, channel: string, resultToken: number): Promise<void>;
  /** Ends a channel, cancelling what it runs, and releases its connection. */
  closeChannel(connectionId: string, channel: string): Promise<void>;
  cancel(runId: number): Promise<void>;

  listConsoles(id: string): Promise<string[]>;
  readConsole(id: string, name: string): Promise<string>;
  writeConsole(id: string, name: string, text: string): Promise<void>;
  deleteConsole(id: string, name: string): Promise<void>;
}
