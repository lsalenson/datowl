// Demo backend used when the UI runs in a plain browser, without the Rust side.
// It serves one fake Postgres data source so every panel can be exercised.

import type { Backend } from './backend';
import type { Column, ConnectionConfig, NodeRef, Project, Row, RunEvent, TreeNode } from './types';

const DEMO_ID = '00000000-0000-4000-8000-000000000001';

const TABLES: Record<string, { columns: [string, string][]; rows: number; view?: boolean }> = {
  users: {
    rows: 2_500,
    columns: [
      ['id', 'int8'],
      ['email', 'text'],
      ['full_name', 'text'],
      ['country', 'varchar'],
      ['active', 'bool'],
      ['created_at', 'timestamptz'],
    ],
  },
  orders: {
    rows: 48_000,
    columns: [
      ['id', 'int8'],
      ['user_id', 'int8'],
      ['status', 'text'],
      ['total', 'numeric'],
      ['created_at', 'timestamptz'],
    ],
  },
  products: {
    rows: 120,
    columns: [
      ['id', 'int4'],
      ['sku', 'text'],
      ['name', 'text'],
      ['price', 'numeric'],
      ['stock', 'int4'],
    ],
  },
  active_users: { rows: 1_900, view: true, columns: [['id', 'int8'], ['email', 'text']] },
};

const NAMES = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Edsger Dijkstra', 'Barbara Liskov', 'Donald Knuth', 'Margaret Hamilton', 'Ken Thompson'];
const COUNTRIES = ['FR', 'US', 'DE', 'JP', 'BR', 'CA', 'IN', null];
const STATUSES = ['paid', 'pending', 'shipped', 'refunded'];

function cell(table: string, column: string, type: string, i: number): string | null {
  const id = i + 1;
  if (column === 'id') return String(id);
  if (column === 'user_id') return String((i * 7919) % 2500 + 1);
  if (column === 'email') return `${NAMES[i % NAMES.length].split(' ')[0].toLowerCase()}.${id}@example.com`;
  if (column === 'full_name' || column === 'name') return table === 'products' ? `Product #${id}` : NAMES[i % NAMES.length];
  if (column === 'country') return COUNTRIES[i % COUNTRIES.length];
  if (column === 'active') return i % 9 === 0 ? 'f' : 't';
  if (column === 'status') return STATUSES[i % STATUSES.length];
  if (column === 'sku') return `SKU-${String(id).padStart(5, '0')}`;
  if (column === 'stock') return String((i * 37) % 400);
  if (type === 'numeric') return ((i * 1931) % 100_000 / 100).toFixed(2);
  if (type === 'timestamptz') return new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString().replace('T', ' ').replace('.000Z', '+00');
  return null;
}

const NUMERIC = new Set(['int2', 'int4', 'int8', 'numeric', 'float8']);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let connection: ConnectionConfig = {
  id: DEMO_ID,
  name: 'demo@localhost',
  driver: 'postgres',
  host: 'localhost',
  port: 5432,
  user: 'demo',
  database: 'demo',
  tls: 'disable',
  savePassword: true,
  color: null,
};
const consoles = new Map<string, string>([
  [`${DEMO_ID}/console`, '-- Demo data (browser preview, no Rust backend)\nselect * from users;\n\nselect status, count(*), sum(total)\nfrom orders\ngroup by status;\n'],
]);

interface Cursor {
  table: string;
  offset: number;
  limit: number;
  token: number;
}
let cursor: Cursor | null = null;
let nextToken = 1;
let nextRun = 1;

function tableNode(name: string): TreeNode {
  const object = { database: 'demo', schema: 'public', name, kind: TABLES[name].view ? 'view' : 'table', oid: null } as const;
  return { label: name, detail: null, icon: object.kind, node: { type: 'object', object }, object };
}

function children(node: NodeRef): TreeNode[] {
  switch (node.type) {
    case 'root':
      return [
        { label: 'demo', detail: null, icon: 'database', node: { type: 'database', database: 'demo' }, object: null },
        { label: 'postgres', detail: null, icon: 'database', node: null, object: null },
      ];
    case 'database':
      return [{ label: 'public', detail: null, icon: 'schema', node: { type: 'schema', database: 'demo', schema: 'public' }, object: null }];
    case 'schema':
      return [
        { label: 'tables', detail: '3', icon: 'folder', node: { type: 'folder', database: 'demo', schema: 'public', folder: 'tables' }, object: null },
        { label: 'views', detail: '1', icon: 'folder', node: { type: 'folder', database: 'demo', schema: 'public', folder: 'views' }, object: null },
      ];
    case 'folder':
      return Object.keys(TABLES)
        .filter((t) => !!TABLES[t].view === (node.folder === 'views'))
        .map(tableNode);
    case 'object':
      if (node.object.kind === 'view') return columns(node.object.name);
      return [
        { label: 'columns', detail: String(TABLES[node.object.name].columns.length), icon: 'folder', node: { type: 'objectFolder', object: node.object, folder: 'columns' }, object: null },
        { label: 'keys', detail: '1', icon: 'folder', node: { type: 'objectFolder', object: node.object, folder: 'keys' }, object: null },
      ];
    case 'objectFolder':
      if (node.folder === 'keys') return [{ label: `${node.object.name}_pkey`, detail: 'PRIMARY KEY (id)', icon: 'key', node: null, object: null }];
      return columns(node.object.name);
  }
}

function columns(table: string): TreeNode[] {
  return TABLES[table].columns.map(([name, type]) => ({
    label: name,
    detail: type,
    icon: name === 'id' ? 'primaryKeyColumn' : 'column',
    node: null,
    object: null,
  }));
}

function emitPage(c: Cursor, pageSize: number, index: number, onEvent: (e: RunEvent) => void) {
  const spec = TABLES[c.table];
  const end = Math.min(c.offset + pageSize, c.limit);
  const rows: Row[] = [];
  for (let i = c.offset; i < end; i++) rows.push(spec.columns.map(([name, type]) => cell(c.table, name, type, i)));
  onEvent({ kind: 'rows', index, rows });
  c.offset = end;
  return { rows: rows.length, hasMore: end < c.limit };
}

// The demo project's folder: `null` marks a directory.
const MOCK_FILES: Record<string, string | null> = {
  '~/Projets/demo/db': null,
  '~/Projets/demo/db/migrations': null,
  '~/Projets/demo/db/migrations/001_init.sql': 'create table users (\n  id bigserial primary key,\n  email text not null\n);\n',
  '~/Projets/demo/db/reports.sql': 'select status, count(*) from orders group by status;\n',
  '~/Projets/demo/docs': null,
  '~/Projets/demo/docs/schema.md': '# Schema\n\nUsers and orders.\n',
  '~/Projets/demo/.env.example': 'DATABASE_URL=postgres://localhost/demo\n',
  '~/Projets/demo/README.md': '# demo\n',
  '~/Projets/demo/compose.yaml': 'services:\n  db:\n    image: postgres:16\n',
};

// Projects survive reloads (switching project reloads the page), like the real registry.
const PROJECTS_KEY = 'datowl.mock.projects';
const hour = 3_600_000;
function mockProjects(): { current: string; projects: Project[] } {
  try {
    const saved = localStorage.getItem(PROJECTS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Fall through to the demo set.
  }
  const now = Date.now();
  return {
    current: 'p-demo',
    projects: [
      { id: 'p-demo', name: 'demo', path: '~/Projets/demo', lastOpened: now, branch: 'main' },
      { id: 'p-warehouse', name: 'warehouse', path: '~/DataGripProjects/warehouse', lastOpened: now - hour, branch: null },
      { id: 'p-th42', name: 'TH42', path: null, lastOpened: now - 5 * hour, branch: null },
    ],
  };
}
function saveMockProjects(state: { current: string; projects: Project[] }) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(state));
  } catch {
    // Private mode: projects only last for this page.
  }
}

export const mockBackend: Backend = {
  listProjects: async () => {
    const state = mockProjects();
    return { ...state, projects: [...state.projects].sort((a, b) => b.lastOpened - a.lastOpened) };
  },
  createProject: async (name, path) => {
    const state = mockProjects();
    const project: Project = { id: `p-${crypto.randomUUID()}`, name, path, lastOpened: Date.now(), branch: null };
    saveMockProjects({ ...state, projects: [...state.projects, project] });
    return project;
  },
  openProject: async (id) => {
    const state = mockProjects();
    saveMockProjects({ current: id, projects: state.projects.map((p) => (p.id === id ? { ...p, lastOpened: Date.now() } : p)) });
  },
  renameProject: async (id, name) => {
    const state = mockProjects();
    const projects = state.projects.map((p) => (p.id === id ? { ...p, name } : p));
    saveMockProjects({ ...state, projects });
    return projects.find((p) => p.id === id)!;
  },
  deleteProject: async (id) => {
    const state = mockProjects();
    saveMockProjects({ ...state, projects: state.projects.filter((p) => p.id !== id) });
  },
  gitBranches: async () => ['feature/projects', 'main'],
  datagripSources: async () => null,
  listDir: async (path) => {
    const children = Object.keys(MOCK_FILES)
      .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .map((p) => ({ name: p.slice(path.length + 1), path: p, isDir: MOCK_FILES[p] === null }));
    return children.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  },
  readFile: async (path) => {
    const text = MOCK_FILES[path];
    if (typeof text !== 'string') throw { message: 'Not a file', position: null };
    return text;
  },
  writeFile: async (path, text) => {
    MOCK_FILES[path] = text;
  },

  listConnections: async () => [connection],
  saveConnection: async (config) => {
    connection = config;
    return config;
  },
  deleteConnection: async () => {},
  testConnection: async () => {
    await delay(300);
    return 'PostgreSQL 16.4 (demo)';
  },
  connect: async () => {
    await delay(250);
    return { serverVersion: 'PostgreSQL 16.4 (demo)' };
  },
  disconnect: async () => {},

  children: async (_id, node) => {
    await delay(60);
    return children(node);
  },
  ddl: async (_id, object) => {
    const spec = TABLES[object.name];
    const cols = spec.columns.map(([n, t]) => `    ${n.padEnd(10)} ${t}${n === 'id' ? ' NOT NULL' : ''}`);
    return `CREATE TABLE public.${object.name}\n(\n${cols.join(',\n')},\n    CONSTRAINT ${object.name}_pkey PRIMARY KEY (id)\n);\n`;
  },
  sideQuery: async () => {
    throw new Error('The demo backend cannot run SQL');
  },
  completionSchema: async () => ({
    defaultSchema: 'public',
    tables: Object.entries(TABLES).map(([name, spec]) => ({
      schema: 'public',
      name,
      kind: spec.view ? 'view' : 'table',
      columns: spec.columns.map(([n, t]) => ({ name: n, typeName: t })),
    })),
  }),

  splitStatements: async (sql) => {
    const ranges = [];
    let start = 0;
    for (let i = 0; i <= sql.length; i++) {
      if (i === sql.length || sql[i] === ';') {
        const text = sql.slice(start, i);
        const lead = text.length - text.trimStart().length;
        const trimmed = text.trim();
        if (trimmed && !trimmed.split('\n').every((l) => l.trim().startsWith('--') || !l.trim())) {
          const s = start + lead;
          ranges.push({ start: s, end: s + trimmed.length });
        }
        start = i + 1;
      }
    }
    return ranges;
  },

  execute: async (_connectionId, sql, pageSize, onEvent) => {
    const runId = nextRun++;
    const ranges = await mockBackend.splitStatements(sql, 'postgres');
    void (async () => {
      const t0 = performance.now();
      for (const [index, range] of ranges.entries()) {
        const text = sql.slice(range.start, range.end).replace(/^(\s*--[^\n]*\n)+/, '');
        onEvent({ kind: 'statementStarted', index, sql: text, offset: range.start });
        await delay(30);
        const typo = /\bfrm\b/i.exec(text);
        if (typo) {
          onEvent({ kind: 'error', index, message: '[42601] ERROR: syntax error at or near "frm"', position: typo.index + 1 });
          onEvent({ kind: 'finished', elapsedMs: performance.now() - t0, cancelled: false });
          return;
        }
        const table = /\bfrom\s+(?:public\.)?(\w+)/i.exec(text)?.[1];
        if (/^\s*select/i.test(text) && table && TABLES[table] && /group by/i.test(text)) {
          const cols: Column[] = [
            { name: 'status', typeName: 'text', numeric: false },
            { name: 'count', typeName: 'int8', numeric: true },
            { name: 'sum', typeName: 'numeric', numeric: true },
          ];
          onEvent({ kind: 'columns', index, columns: cols });
          onEvent({ kind: 'rows', index, rows: STATUSES.map((s, i) => [s, String(12_000 + i * 17), (1_234_567.89 * (i + 1)).toFixed(2)]) });
          onEvent({ kind: 'statementFinished', index, rows: 4, hasMore: false, truncated: false, rowsAffected: null, elapsedMs: 4.2, resultToken: null });
        } else if (/^\s*select/i.test(text) && table && TABLES[table]) {
          const spec = TABLES[table];
          onEvent({
            kind: 'columns',
            index,
            columns: spec.columns.map(([name, type]) => ({ name, typeName: type, numeric: NUMERIC.has(type) })),
          });
          const limit = Number(/\blimit\s+(\d+)/i.exec(text)?.[1] ?? spec.rows);
          cursor = { table, offset: 0, limit: Math.min(limit, spec.rows), token: nextToken++ };
          const page = emitPage(cursor, pageSize, index, onEvent);
          onEvent({
            kind: 'statementFinished',
            index,
            rows: page.rows,
            hasMore: page.hasMore,
            truncated: false,
            rowsAffected: null,
            elapsedMs: 3 + Math.random() * 8,
            resultToken: page.hasMore ? cursor.token : null,
          });
        } else if (/^\s*select/i.test(text)) {
          onEvent({ kind: 'columns', index, columns: [{ name: '?column?', typeName: 'int4', numeric: true }] });
          onEvent({ kind: 'rows', index, rows: [['1']] });
          onEvent({ kind: 'statementFinished', index, rows: 1, hasMore: false, truncated: false, rowsAffected: null, elapsedMs: 0.8, resultToken: null });
        } else {
          onEvent({ kind: 'statementFinished', index, rows: 0, hasMore: false, truncated: false, rowsAffected: 3, elapsedMs: 1.6, resultToken: null });
        }
      }
      onEvent({ kind: 'finished', elapsedMs: performance.now() - t0, cancelled: false });
    })();
    return runId;
  },
  fetchMore: async (_connectionId, resultToken, pageSize, onEvent) => {
    const runId = nextRun++;
    void (async () => {
      await delay(40);
      if (!cursor || cursor.token !== resultToken) {
        onEvent({ kind: 'error', index: 0, message: 'The result set is closed', position: null });
      } else {
        const page = emitPage(cursor, pageSize, 0, onEvent);
        onEvent({ kind: 'statementFinished', index: 0, rows: page.rows, hasMore: page.hasMore, truncated: false, rowsAffected: null, elapsedMs: 2.1, resultToken: page.hasMore ? resultToken : null });
      }
      onEvent({ kind: 'finished', elapsedMs: 2.1, cancelled: false });
    })();
    return runId;
  },
  closeResult: async (_connectionId, resultToken) => {
    if (cursor?.token === resultToken) cursor = null;
  },
  cancel: async () => {},

  listConsoles: async (id) => [...consoles.keys()].filter((k) => k.startsWith(id)).map((k) => k.split('/')[1]),
  readConsole: async (id, name) => consoles.get(`${id}/${name}`) ?? '',
  writeConsole: async (id, name, text) => {
    consoles.set(`${id}/${name}`, text);
  },
  deleteConsole: async (id, name) => {
    consoles.delete(`${id}/${name}`);
  },
};
