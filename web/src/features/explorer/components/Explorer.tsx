import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDashed,
  Cloud,
  Crosshair,
  Database,
  EllipsisVertical,
  Eye,
  FileCode2,
  Folder,
  GitCompareArrows,
  LoaderCircle,
  Minus,
  Plug,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  SlidersHorizontal,
  Square,
  SquareTerminal,
  Stamp,
  Table2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { errorMessage, type ConnectionConfig, type DriverKind, type NodeIcon as Icon, type NodeRef, type ObjectRef } from '@/shared/api';
import { qualifiedName } from '@/shared/lib/sql';
import { useConnections } from '@/features/connections';
import { useUi, type MenuItem } from '@/shared/model/ui';
import { useWorkspace } from '@/features/workspace';
import { parseConnectionUrl } from '@/features/connections';
import { log } from '@/shared/model/output';
import { executeStatement } from '@/features/query';
import { DriverBadge, NodeIcon } from '@/shared/ui/NodeIcon';
import {
  canDrop,
  canRename,
  dropSql,
  needsSignature,
  renameSql,
  signatureQuery,
  targetName,
  targetNoun,
  type Target,
} from '../lib/objectActions';
import { SchemaFilterPopover } from './SchemaFilterPopover';
import { isSchemaLevel, isShown, useSchemaFilter } from '../model/schemaFilter';
import { childKey, rootKey, useTree } from '../model/treeStore';

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const DRIVER_LABELS: Record<DriverKind, string> = { postgres: 'PostgreSQL', clickhouse: 'ClickHouse' };

const ROW_HEIGHT = 24;
const OVERSCAN = 12;

interface Row {
  key: string;
  depth: number;
  label: string;
  detail: string | null;
  icon: Icon | null;
  connection: ConnectionConfig;
  node: NodeRef | null;
  object: ObjectRef | null;
  isRoot: boolean;
  expanded: boolean;
  loading: boolean;
  error?: string;
  /** On the node listing schemas (ClickHouse: databases): how many the filter shows. */
  schemas?: { shown: number; total: number };
}

function useRows(query: string): Row[] {
  const connections = useConnections((s) => s.list);
  const { expanded, children, loading, errors } = useTree();
  const choices = useSchemaFilter((s) => s.choices);

  return useMemo(() => {
    const rows: Row[] = [];
    // While filtering, every loaded node is searched and matching branches open up.
    const q = query.trim().toLowerCase();
    const memo = new Map<string, boolean>();
    const matches = (key: string, label: string): boolean => {
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      let hit = label.toLowerCase().includes(q);
      for (const child of children[key] ?? []) if (matches(childKey(key, child), child.label)) hit = true;
      memo.set(key, hit);
      return hit;
    };
    // Children as shown: the schema level goes through the data source's schema filter.
    const visible = (key: string, connection: ConnectionConfig) => {
      const list = children[key] ?? [];
      if (!isSchemaLevel(list, connection)) return list;
      return list.filter((c) => isShown(choices[connection.id], c.label));
    };
    const schemaCount = (key: string, connection: ConnectionConfig) => {
      const list = children[key];
      if (!list || !isSchemaLevel(list, connection)) return undefined;
      return { shown: visible(key, connection).length, total: list.length };
    };
    const opens = (key: string) =>
      q ? (children[key] ?? []).some((c) => matches(childKey(key, c), c.label)) : !!expanded[key];
    const walk = (parent: string, connection: ConnectionConfig, depth: number) => {
      if (errors[parent]) {
        rows.push({
          key: `${parent}/!error`,
          depth,
          label: errors[parent],
          detail: null,
          icon: null,
          connection,
          node: null,
          object: null,
          isRoot: false,
          expanded: false,
          loading: false,
          error: errors[parent],
        });
        return;
      }
      for (const child of visible(parent, connection)) {
        const key = childKey(parent, child);
        if (q && !matches(key, child.label)) continue;
        const isExpanded = opens(key) && !!child.node;
        rows.push({
          key,
          depth,
          label: child.label,
          detail: child.detail,
          icon: child.icon,
          connection,
          node: child.node,
          object: child.object,
          isRoot: false,
          expanded: isExpanded,
          loading: !!loading[key],
          schemas: schemaCount(key, connection),
        });
        if (isExpanded) walk(key, connection, depth + 1);
      }
    };
    for (const connection of connections) {
      const key = rootKey(connection.id);
      if (q && !matches(key, connection.name)) continue;
      rows.push({
        key,
        depth: 0,
        label: connection.name,
        detail: `${connection.host}:${connection.port}`,
        icon: null,
        connection,
        node: { type: 'root' },
        object: null,
        isRoot: true,
        expanded: opens(key),
        loading: !!loading[key],
        schemas: schemaCount(key, connection),
      });
      if (opens(key)) walk(key, connection, 1);
    }
    return rows;
  }, [connections, expanded, children, loading, errors, query, choices]);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export function Explorer() {
  const [filter, setFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const setExplorerVisible = useUi((s) => s.setExplorerVisible);
  const rows = useRows(filter);
  const tree = useTree();
  const connectionState = useConnections((s) => s.state);
  const openDataSources = useUi((s) => s.openDataSources);
  const openMenu = useUi((s) => s.openMenu);
  const ask = useUi((s) => s.ask);
  const workspace = useWorkspace.getState();
  const activeTab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId));

  const [schemaPopover, setSchemaPopover] = useState<{
    treeKey: string;
    connection: ConnectionConfig;
    node: NodeRef;
    x: number;
    y: number;
  } | null>(null);

  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggle = (row: Row) => {
    if (!row.node) return;
    if (row.expanded) tree.collapse(row.key);
    else void tree.expand(row.key, row.connection.id, row.node);
  };

  const openData = (connection: ConnectionConfig, object: ObjectRef) => workspace.openObject('table', connection.id, object);

  const activate = (row: Row) => {
    if (row.object && row.object.kind !== 'function') openData(row.connection, row.object);
    else if (row.object) workspace.openObject('ddl', row.connection.id, row.object);
    else toggle(row);
  };

  const parentOf = (row: Row) => rows.find((r) => r.key === row.key.slice(0, row.key.lastIndexOf('/')));

  /** What Rename / Drop act on for a row, if anything. */
  const targetOf = (row: Row): Target | null => {
    if (row.object) return { kind: 'object', object: row.object };
    if (row.node?.type === 'schema') return { kind: 'schema', database: row.node.database, schema: row.node.schema };
    if (row.node?.type === 'database') return { kind: 'database', database: row.node.database };
    const parent = parentOf(row);
    if ((row.icon === 'column' || row.icon === 'primaryKeyColumn') && parent?.node?.type === 'objectFolder') {
      return { kind: 'column', table: parent.node.object, column: row.label };
    }
    return null;
  };

  // Editor tabs showing a renamed or dropped object (or anything inside a schema / database).
  const closeTabsOf = (connectionId: string, target: Target) => {
    const { tabs, close } = useWorkspace.getState();
    for (const tab of tabs) {
      if (tab.kind === 'console' || tab.kind === 'file' || tab.connectionId !== connectionId) continue;
      const o = tab.object;
      const hit =
        target.kind === 'object'
          ? o.name === target.object.name && o.schema === target.object.schema && o.database === target.object.database
          : target.kind === 'schema'
            ? o.schema === target.schema
            : target.kind === 'database' && o.database === target.database;
      if (hit) close(tab.id);
    }
  };

  /** Runs a rename / drop statement, then reloads the parent node and the completion schema. */
  const apply = async (row: Row, target: Target, sql: string) => {
    const { connection } = row;
    try {
      await executeStatement(connection.id, sql);
    } catch (e) {
      await ask({ title: 'Statement Failed', message: errorMessage(e), preview: sql, confirmLabel: 'Close' });
      return;
    }
    closeTabsOf(connection.id, target);
    const parent = parentOf(row);
    if (parent?.node) await tree.refresh(parent.key, connection.id, parent.node);
    void useConnections.getState().refreshSchema(connection.id);
  };

  const signatureOf = async (row: Row, target: Target): Promise<string | undefined> => {
    if (!needsSignature(target, row.connection.driver) || target.kind !== 'object') return undefined;
    const [first] = await executeStatement(row.connection.id, signatureQuery(target.object));
    return first?.[0] ?? undefined;
  };

  const renameRow = async (row: Row) => {
    const { connection } = row;
    if (row.isRoot) {
      const name = await ask({
        title: 'Rename Data Source',
        input: { label: 'Name', value: connection.name },
        confirmLabel: 'Rename',
      });
      if (name && name !== connection.name) await useConnections.getState().save({ ...connection, name }, null);
      return;
    }
    const target = targetOf(row);
    if (!target || !canRename(target, connection.driver)) return;
    const signature = await signatureOf(row, target).catch(() => undefined);
    const current = targetName(target);
    const name = await ask({
      title: `Rename ${titleCase(targetNoun(target))}`,
      input: { label: 'New name', value: current },
      preview: (value) => (value.trim() ? (renameSql(target, value.trim(), connection.driver, signature) ?? '') : ''),
      confirmLabel: 'Refactor',
    });
    if (!name || name === current) return;
    const sql = renameSql(target, name, connection.driver, signature);
    if (sql) await apply(row, target, sql);
  };

  const deleteSource = async (connection: ConnectionConfig) => {
    const ok = await ask({
      title: 'Delete Data Source',
      message: (
        <>
          Delete data source <b>{connection.name}</b>? Its query consoles are deleted too.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok === null) return;
    await useConnections.getState().remove(connection.id);
    workspace.forgetConnection(connection.id);
  };

  const dropRow = async (row: Row) => {
    const { connection } = row;
    if (row.isRoot) return deleteSource(connection);
    const target = targetOf(row);
    if (!target || !canDrop(target, connection.driver)) return;
    let signature: string | undefined;
    try {
      signature = await signatureOf(row, target);
    } catch (e) {
      log('error', connection.name, errorMessage(e));
      return;
    }
    const sql = dropSql(target, connection.driver, signature);
    if (!sql) return;
    const ok = await ask({
      title: 'Drop',
      message: (
        <>
          Drop {targetNoun(target)} <b>{targetName(target)}</b> from <b>{connection.name}</b>? This cannot be undone.
        </>
      ),
      preview: `${sql};`,
      confirmLabel: 'Drop',
      danger: true,
    });
    if (ok !== null) await apply(row, target, sql);
  };

  const addFromUrl = async () => {
    let error = '';
    for (;;) {
      const url = await ask({
        title: 'Data Source from URL',
        message: error || 'PostgreSQL (postgresql://, JDBC) or ClickHouse (clickhouse://, http(s)://, JDBC) URL.',
        input: { label: 'URL', value: '', placeholder: 'postgresql://user:password@host:5432/database' },
        confirmLabel: 'Continue',
      });
      if (url === null) return;
      try {
        useUi.getState().openNewDataSource(parseConnectionUrl(url));
        return;
      } catch (e) {
        error = errorMessage(e);
      }
    }
  };

  // DataGrip's "+" menu, also the "New" submenu of the context menu.
  const newItems = (connection: ConnectionConfig | undefined): MenuItem[] => [
    {
      label: 'Query Console',
      icon: <SquareTerminal size={14} />,
      shortcut: '⇧⌘L',
      disabled: !connection,
      onSelect: () => connection && void workspace.newConsole(connection.id),
    },
    { label: 'Query File…', icon: <FileCode2 size={14} />, shortcut: '⇧⌘J', disabled: true },
    { separator: true },
    {
      label: 'Data Source',
      icon: <Database size={14} />,
      submenu: (['postgres', 'clickhouse'] as DriverKind[]).map((driver) => ({
        label: DRIVER_LABELS[driver],
        icon: <DriverBadge driver={driver} connected={false} size={14} />,
        onSelect: () => openDataSources(`new:${driver}`),
      })),
    },
    { label: 'Data Source from Cloud Provider', icon: <Cloud size={14} />, submenu: [], disabled: true },
    { label: 'Data Source Templates', icon: <Stamp size={14} />, badge: 'Beta', disabled: true },
    { label: 'Data Source from File/Folder', icon: <Folder size={14} />, disabled: true },
    { label: 'Data Source from URL', icon: <Plug size={14} />, onSelect: () => void addFromUrl() },
    { label: 'DDL Data Source', icon: <ScrollText size={14} />, disabled: true },
    { separator: true },
    { label: 'Folder', icon: <Folder size={14} />, disabled: true },
    { label: 'Driver', icon: <CircleDashed size={14} />, disabled: true },
  ];

  // Same entries and order as DataGrip's Database Explorer context menu; what Datowl
  // cannot do yet stays visible, greyed out.
  const menuFor = (row: Row): MenuItem[] => {
    const { connection, object } = row;
    const connected = connectionState[connection.id]?.status === 'connected';
    const copy = (text: string) => void navigator.clipboard.writeText(text);
    const disconnect = async () => {
      await useConnections.getState().disconnect(connection.id);
      tree.forget(connection.id);
    };
    const target = targetOf(row);
    const renamable = row.isRoot || (target !== null && canRename(target, connection.driver));
    const droppable = row.isRoot || (target !== null && canDrop(target, connection.driver));

    return [
      { label: 'New', icon: <Plus size={14} />, submenu: newItems(connection) },
      { label: 'Modify Virtual View…', shortcut: '⌘F6', disabled: true },
      {
        label: 'Copy/Paste',
        submenu: [
          { label: 'Copy Name', onSelect: () => copy(object?.name ?? row.label) },
          ...(object
            ? [
                { label: 'Copy Reference', shortcut: '⌥⇧⌘C', onSelect: () => copy(qualifiedName(object, connection.driver)) },
                {
                  label: 'Copy SELECT Statement',
                  onSelect: () => copy(`SELECT * FROM ${qualifiedName(object, connection.driver)};`),
                },
              ]
            : []),
        ],
      },
      {
        label: 'Refresh',
        icon: <RefreshCw size={14} />,
        shortcut: '⌘R',
        disabled: !row.node,
        onSelect: () => row.node && void tree.refresh(row.key, connection.id, row.node),
      },
      { separator: true },
      { label: 'Rename…', shortcut: '⇧F6', disabled: !renamable, onSelect: () => void renameRow(row) },
      { separator: true },
      ...(object
        ? [
            ...(object.kind !== 'function'
              ? [{ label: 'Edit Data', shortcut: 'F4', onSelect: () => openData(connection, object) }]
              : []),
            { label: 'Go to DDL', shortcut: '⌘B', onSelect: () => workspace.openObject('ddl', connection.id, object) },
          ]
        : [{ label: 'Open the List', shortcut: '⌘↓', disabled: true }]),
      { label: 'Quick Documentation', shortcut: 'F1', disabled: true },
      { label: 'Compare Schema Structure', icon: <GitCompareArrows size={14} />, shortcut: '⌘D', disabled: true },
      { separator: true },
      {
        label: 'SQL Scripts',
        submenu: [
          {
            label: 'Generate DDL to Query Console',
            disabled: !object,
            onSelect: () => object && workspace.openObject('ddl', connection.id, object),
          },
          { label: 'SQL Generator…', shortcut: '⌥⌘G', disabled: true },
          { label: 'Run SQL Script…', disabled: true },
        ],
      },
      {
        label: 'Tools',
        submenu: [
          connected
            ? { label: 'Disconnect', onSelect: () => void disconnect() }
            : { label: 'Connect', onSelect: () => void tree.expand(rootKey(connection.id), connection.id, { type: 'root' }) },
          { label: 'Jump to Query Console…', shortcut: '⇧⌘F10', onSelect: () => workspace.openConsole(connection.id) },
          { label: 'New Query Console', shortcut: '⇧⌘L', onSelect: () => void workspace.newConsole(connection.id) },
          { separator: true },
          { label: 'Data Source Properties…', shortcut: '⌘;', onSelect: () => openDataSources(connection.id) },
        ],
      },
      { label: 'Diagrams', submenu: [], disabled: true },
      { separator: true },
      { label: 'Diagnostics', submenu: [], disabled: true },
      { separator: true },
      { label: 'Drop…', shortcut: '⌦', danger: droppable, disabled: !droppable, onSelect: () => void dropRow(row) },
    ];
  };

  const onContextMenu = (e: MouseEvent, row: Row) => {
    e.preventDefault();
    tree.select(row.key);
    openMenu(e.clientX, e.clientY, menuFor(row));
  };

  const selectedIndex = rows.findIndex((r) => r.key === tree.selected);
  const selectedRow = rows[selectedIndex];

  const onKeyDown = (e: KeyboardEvent) => {
    const move = (index: number) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
      if (!row) return;
      tree.select(row.key);
      const el = viewport.current!;
      const top = rows.indexOf(row) * ROW_HEIGHT;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
    };
    if (e.key === 'ArrowDown') move(selectedIndex + 1);
    else if (e.key === 'ArrowUp') move(selectedIndex - 1);
    else if (e.key === 'ArrowRight' && selectedRow?.node && !selectedRow.expanded) toggle(selectedRow);
    else if (e.key === 'ArrowLeft' && selectedRow) {
      if (selectedRow.expanded) toggle(selectedRow);
      else move(rows.findLastIndex((r, i) => i < selectedIndex && r.depth < selectedRow.depth));
    } else if (e.key === 'Enter' && selectedRow) activate(selectedRow);
    else if ((e.metaKey || e.ctrlKey) && e.key === 'b' && selectedRow?.object) {
      workspace.openObject('ddl', selectedRow.connection.id, selectedRow.object);
    } else if (e.shiftKey && e.key === 'F6' && selectedRow) void renameRow(selectedRow);
    // ⌦, or ⌘⌫ on keyboards without forward delete.
    else if ((e.key === 'Delete' || (e.metaKey && e.key === 'Backspace')) && selectedRow) void dropRow(selectedRow);
    else return;
    e.preventDefault();
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const selectedConnection = selectedRow?.connection ?? rows[0]?.connection;

  const disconnect = async (id: string) => {
    await useConnections.getState().disconnect(id);
    tree.forget(id);
  };

  // The tree node of the object open in the active editor tab, when it is loaded.
  const locateKey =
    activeTab && (activeTab.kind === 'table' || activeTab.kind === 'ddl')
      ? rows.find(
          (r) =>
            r.object &&
            r.connection.id === activeTab.connectionId &&
            r.object.name === activeTab.object.name &&
            r.object.schema === activeTab.object.schema,
        )?.key
      : undefined;
  const locate = () => {
    if (!locateKey) return;
    tree.select(locateKey);
    const index = rows.findIndex((r) => r.key === locateKey);
    viewport.current?.scrollTo({ top: Math.max(0, index * ROW_HEIGHT - 80) });
  };

  const optionsMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: showFilter ? 'Hide Filter' : 'Show Filter', onSelect: () => setShowFilter(!showFilter) },
      { label: 'Collapse All', onSelect: tree.collapseAll },
    ]);
  };

  const newMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, newItems(selectedConnection ?? undefined));
  };

  return (
    <section className="card explorer">
      <header className="card-header">
        <span className="card-title">Database Explorer</span>
        <div className="card-actions">
          <IconButton icon={Crosshair} label="Select Opened Object" size={14} disabled={!locateKey} onClick={locate} />
          <IconButton icon={ChevronsUpDown} label="Expand Selected" size={14} disabled={!selectedRow?.node} onClick={() => selectedRow && toggle(selectedRow)} />
          <IconButton icon={ChevronsDownUp} label="Collapse All" shortcut="⌘−" size={14} onClick={tree.collapseAll} />
          <IconButton icon={EllipsisVertical} label="Options" size={14} onClick={optionsMenu} />
          <IconButton icon={Minus} label="Hide" size={14} onClick={() => setExplorerVisible(false)} />
        </div>
      </header>
      <div className="toolbar">
        <IconButton icon={Plus} label="New" size={15} onClick={newMenu} />
        <IconButton
          icon={SlidersHorizontal}
          label="Data Source Properties"
          shortcut="⌘;"
          size={14}
          disabled={!selectedConnection}
          onClick={() => selectedConnection && openDataSources(selectedConnection.id)}
        />
        <span className="toolbar-separator" />
        <IconButton
          icon={RefreshCw}
          label="Refresh"
          shortcut="⌘R"
          size={14}
          disabled={!selectedRow?.node}
          onClick={() => selectedRow?.node && void tree.refresh(selectedRow.key, selectedRow.connection.id, selectedRow.node)}
        />
        <IconButton
          icon={Square}
          label="Disconnect"
          size={12}
          disabled={!selectedConnection || connectionState[selectedConnection.id]?.status !== 'connected'}
          onClick={() => selectedConnection && void disconnect(selectedConnection.id)}
        />
        <span className="toolbar-separator" />
        <IconButton
          icon={Table2}
          label="Edit Data"
          shortcut="F4"
          size={14}
          disabled={!selectedRow?.object || selectedRow.object.kind === 'function'}
          onClick={() => selectedRow?.object && openData(selectedRow.connection, selectedRow.object)}
        />
        <IconButton
          icon={SquareTerminal}
          label="Jump to Query Console"
          shortcut="⇧⌘L"
          size={14}
          disabled={!selectedConnection}
          onClick={() => selectedConnection && workspace.openConsole(selectedConnection.id)}
        />
        <button
          type="button"
          className="text-btn"
          title="Show DDL (⌘B)"
          disabled={!selectedRow?.object}
          onClick={() => selectedRow?.object && workspace.openObject('ddl', selectedRow.connection.id, selectedRow.object)}
        >
          DDL
        </button>
        <span className="toolbar-separator" />
        <IconButton
          icon={Eye}
          label="View Options: filter objects"
          size={14}
          active={showFilter}
          onClick={() => {
            setShowFilter(!showFilter);
            if (showFilter) setFilter('');
          }}
        />
      </div>
      {showFilter && (
        <label className="tree-filter">
          <Search size={13} />
          <input
            autoFocus
            value={filter}
            placeholder="Filter objects"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('');
                setShowFilter(false);
              }
            }}
            spellCheck={false}
          />
          {filter && (
            <button type="button" className="icon-btn tiny" aria-label="Clear filter" onClick={() => setFilter('')}>
              <X size={12} />
            </button>
          )}
        </label>
      )}
      <div
        className="tree"
        ref={viewport}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {rows.length === 0 && !filter && (
          <div className="tree-empty">
            <span>Create a data source with ⌘N</span>
            <button type="button" className="link-btn" onClick={() => openDataSources('new')}>
              New data source…
            </button>
          </div>
        )}
        {rows.length === 0 && filter && <div className="tree-empty muted">No loaded object matches “{filter}”.</div>}
        <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
          {rows.slice(first, last).map((row, i) => {
            const status = connectionState[row.connection.id]?.status;
            return (
              <div
                key={row.key}
                className={`tree-row${row.isRoot ? ' root' : ''}${row.key === tree.selected ? ' selected' : ''}${row.error ? ' error' : ''}`}
                style={{ top: (first + i) * ROW_HEIGHT, paddingLeft: 6 + row.depth * 14 }}
                onClick={() => tree.select(row.key)}
                onDoubleClick={() => activate(row)}
                onContextMenu={(e) => onContextMenu(e, row)}
                title={row.error ?? row.detail ?? undefined}
              >
                <span
                  className="tree-twisty"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(row);
                  }}
                >
                  {row.loading || (row.isRoot && status === 'connecting') ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : row.node ? (
                    row.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                  ) : null}
                </span>
                {row.isRoot ? (
                  <DriverBadge driver={row.connection.driver} connected={status === 'connected'} />
                ) : (
                  row.icon && <NodeIcon icon={row.icon} />
                )}
                <span className={`tree-label${!row.node && row.icon === 'database' ? ' dim' : ''}`}>
                  <Highlight text={row.label} query={filter} />
                </span>
                {row.schemas && (
                  <button
                    type="button"
                    className="schema-count"
                    title="Schemas to show"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setSchemaPopover({ treeKey: row.key, connection: row.connection, node: row.node!, x: r.left, y: r.bottom + 4 });
                    }}
                  >
                    {row.schemas.shown} of {row.schemas.total}
                  </button>
                )}
                {row.detail && <span className="tree-detail">{row.detail}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {schemaPopover && <SchemaFilterPopover {...schemaPopover} onClose={() => setSchemaPopover(null)} />}
    </section>
  );
}
