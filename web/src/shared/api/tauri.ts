import { Channel, invoke } from '@tauri-apps/api/core';

import type { Backend } from './backend';
import type { RunEvent } from './types';

function channel(onEvent: (e: RunEvent) => void): Channel<RunEvent> {
  const ch = new Channel<RunEvent>();
  ch.onmessage = onEvent;
  return ch;
}

export const tauriBackend: Backend = {
  listProjects: () => invoke('list_projects'),
  takeNotices: () => invoke('take_notices'),
  createProject: (name, path) => invoke('create_project', { name, path }),
  openProject: (id) => invoke('open_project', { id }),
  renameProject: (id, name) => invoke('rename_project', { id, name }),
  deleteProject: (id) => invoke('delete_project', { id }),
  gitBranches: () => invoke('git_branches'),
  datagripSources: (path) => invoke('datagrip_sources', { path }),
  listDir: (path) => invoke('list_dir', { path }),
  readFile: (path) => invoke('read_file', { path }),
  writeFile: (path, text) => invoke('write_file', { path, text }),
  exportFile: (name, text) => invoke('export_file', { name, text }),

  listConnections: () => invoke('list_connections'),
  saveConnection: (config, password) => invoke('save_connection', { config, password }),
  deleteConnection: (id) => invoke('delete_connection', { id }),
  testConnection: (config, password) => invoke('test_connection', { config, password }),
  connect: (id, password) => invoke('connect', { id, password }),
  disconnect: (id) => invoke('disconnect', { id }),

  children: (id, node) => invoke('children', { id, node }),
  ddl: (id, object) => invoke('ddl', { id, object }),
  completionSchema: (id) => invoke('completion_schema', { id }),
  sideQuery: (id, sql) => invoke('side_query', { id, sql }),

  splitStatements: (sql, dialect) => invoke('split_statements', { sql, dialect }),
  execute: (connectionId, execChannel, sql, pageSize, onEvent) =>
    invoke('execute', { connectionId, channel: execChannel, sql, pageSize, onEvent: channel(onEvent) }),
  fetchMore: (connectionId, execChannel, resultToken, pageSize, onEvent) =>
    invoke('fetch_more', { connectionId, channel: execChannel, resultToken, pageSize, onEvent: channel(onEvent) }),
  closeResult: (connectionId, channel, resultToken) => invoke('close_result', { connectionId, channel, resultToken }),
  closeChannel: (connectionId, channel) => invoke('close_channel', { connectionId, channel }),
  cancel: (runId) => invoke('cancel', { runId }),

  listConsoles: (id) => invoke('list_consoles', { id }),
  readConsole: (id, name) => invoke('read_console', { id, name }),
  writeConsole: (id, name, text) => invoke('write_console', { id, name, text }),
  deleteConsole: (id, name) => invoke('delete_console', { id, name }),
};
