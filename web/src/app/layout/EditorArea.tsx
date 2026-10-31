import {
  Check,
  ChevronDown,
  FastForward,
  FileCode2,
  FileText,
  Layers,
  Play,
  Square,
  SquareTerminal,
  Table2,
  Undo2,
  X,
} from 'lucide-react';
import type { MouseEvent } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { backend } from '@/shared/api';
import { quoteIdent } from '@/shared/lib/sql';
import { useConnections } from '@/features/connections';
import { tabResults, useResults } from '@/features/query';
import { useUi } from '@/shared/model/ui';
import { tabTitle, useWorkspace, type EditorTab } from '@/features/workspace';
import { DdlView } from '@/features/editor';
import { editorRegistry } from '@/features/editor';
import { SqlEditor } from '@/features/editor';
import { cancelRun, runSql } from '@/features/query';
import { TableView } from '@/features/query';

const TAB_ICONS = { console: SquareTerminal, table: Table2, ddl: FileCode2, file: FileText };

function closeTab(tab: EditorTab) {
  // Release a server-side cursor this tab may still hold.
  for (const set of useResults.getState().byTab[tab.id]?.sets ?? []) {
    if (set.hasMore && set.resultToken !== null) void backend.closeResult(tab.connectionId, set.resultToken);
  }
  useResults.getState().dropTab(tab.id);
  useWorkspace.getState().close(tab.id);
}

export function EditorArea() {
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const activate = useWorkspace((s) => s.activate);
  const connections = useConnections((s) => s.list);
  const openMenu = useUi((s) => s.openMenu);

  const onTabMenu = (e: MouseEvent, tab: EditorTab) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { label: 'Close', shortcut: '⌘W', onSelect: () => closeTab(tab) },
      {
        label: 'Close Other Tabs',
        onSelect: () => useWorkspace.getState().tabs.filter((t) => t.id !== tab.id).forEach(closeTab),
      },
    ]);
  };

  const active = tabs.find((t) => t.id === activeId);

  const tabsMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(
      r.right - 240,
      r.bottom + 4,
      tabs.map((t) => ({ label: `${tabTitle(t)}${t.id === activeId ? '  ✓' : ''}`, onSelect: () => activate(t.id) })),
    );
  };

  return (
    <section className="card editor-area">
      <header className="card-header">
        {tabs.length === 0 && <span className="card-title">Editor</span>}
      <nav className="editor-tabs" onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.kind];
          const color = connections.find((c) => c.id === tab.connectionId)?.color;
          return (
            <div
              key={tab.id}
              className={`editor-tab${tab.id === activeId ? ' active' : ''}`}
              onMouseDown={(e) => {
                if (e.button === 1) closeTab(tab);
                else if (e.button === 0) activate(tab.id);
              }}
              onContextMenu={(e) => onTabMenu(e, tab)}
              title={connections.find((c) => c.id === tab.connectionId)?.name}
            >
              <Icon size={14} className={`tab-icon kind-${tab.kind}`} />
              <span>{tabTitle(tab)}</span>
              <span className="tab-source">[{connections.find((c) => c.id === tab.connectionId)?.name}]</span>
              {color && <span className="color-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />}
              <button
                type="button"
                className="tab-close"
                aria-label="Close tab"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => closeTab(tab)}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </nav>
        {tabs.length > 0 && <IconButton icon={ChevronDown} label="Show Hidden Tabs" size={14} onClick={tabsMenu} />}
      </header>
      {active?.kind === 'console' && <ConsoleToolbar tab={active} />}
      <div className="editor-panes">
        {tabs.map((tab) => (
          <div key={tab.id} className="editor-pane" hidden={tab.id !== activeId}>
            {(tab.kind === 'console' || tab.kind === 'file') && <SqlEditor tab={tab} active={tab.id === activeId} />}
            {tab.kind === 'ddl' && <DdlView tab={tab} />}
            {tab.kind === 'table' && <TableView tab={tab} active={tab.id === activeId} />}
          </div>
        ))}
        {!active && <Welcome />}
      </div>
    </section>
  );
}

function ConsoleToolbar({ tab }: { tab: Extract<EditorTab, { kind: 'console' }> }) {
  const results = useResults(tabResults(tab.id));
  const connection = useConnections((s) => s.list.find((c) => c.id === tab.connectionId));
  const snapshot = useConnections((s) => s.schema[tab.connectionId]);
  const openMenu = useUi((s) => s.openMenu);
  const commands = () => editorRegistry.get(tab.id);

  const txMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: 'Auto  ✓', onSelect: () => {} },
      { label: 'Manual', disabled: true },
    ]);
  };

  // Switching the default schema runs SET search_path (Postgres) or USE (ClickHouse).
  const schemaMenu = (e: MouseEvent) => {
    if (!connection || !snapshot) return;
    const r = e.currentTarget.getBoundingClientRect();
    const schemas = [...new Set(snapshot.tables.map((t) => t.schema))].sort();
    openMenu(
      r.left,
      r.bottom + 4,
      schemas.map((schema) => ({
        label: schema === snapshot.defaultSchema ? `${schema}  ✓` : schema,
        onSelect: async () => {
          const ident = quoteIdent(schema, connection.driver);
          const sql = connection.driver === 'postgres' ? `SET search_path TO ${ident}` : `USE ${ident}`;
          await runSql(tab.id, tab.connectionId, sql);
          useConnections.setState((s) => ({
            schema: { ...s.schema, [tab.connectionId]: { ...snapshot, defaultSchema: schema } },
          }));
        },
      })),
    );
  };

  const target = connection
    ? `${connection.driver === 'postgres' ? `${connection.database}.` : ''}${snapshot?.defaultSchema ?? '…'}`
    : '';

  return (
    <div className="toolbar console-toolbar">
      <IconButton icon={Play} tone="run" label="Execute" shortcut="⌘↵" disabled={results.running} onClick={() => commands()?.run()} />
      <IconButton
        icon={FastForward}
        tone="run"
        label="Execute Script"
        shortcut="⇧⌘↵"
        disabled={results.running}
        onClick={() => commands()?.runScript()}
      />
      <span className="toolbar-separator" />
      <button type="button" className="tool-select" onClick={txMenu} title="Transaction mode">
        Tx: Auto <ChevronDown size={12} />
      </button>
      <IconButton icon={Check} label="Commit" disabled />
      <IconButton icon={Undo2} label="Rollback" disabled />
      <span className="toolbar-separator" />
      <IconButton
        icon={Square}
        tone="stop"
        label="Cancel Running Statements"
        shortcut="⌘F2"
        size={13}
        disabled={!results.running}
        onClick={() => void cancelRun(tab.id)}
      />
      <span className="toolbar-spacer" />
      {connection && (
        <>
          <button type="button" className="tool-select" onClick={schemaMenu} title="Default schema">
            <Layers size={13} /> {target} <ChevronDown size={12} />
          </button>
          <span className="tool-select static" title="Session">
            <SquareTerminal size={13} /> {tab.name}
          </span>
        </>
      )}
    </div>
  );
}

const HINTS: [string, string][] = [
  ['Search Everywhere', '⌘K'],
  ['Data Sources', '⌘;'],
  ['Execute Statement', '⌘↵'],
  ['Show DDL', '⌘B'],
  ['Database Explorer', '⌘1'],
  ['Services', '⌘8'],
];

/** Empty editor area, like the IDE's: a few shortcut hints. */
function Welcome() {
  const connections = useConnections((s) => s.list);
  const openDataSources = useUi((s) => s.openDataSources);
  const openConsole = useWorkspace((s) => s.openConsole);

  return (
    <div className="empty-editor">
      <dl>
        {HINTS.map(([label, keys]) => (
          <div key={label} className="hint">
            <dt>{label}</dt>
            <dd>{keys}</dd>
          </div>
        ))}
      </dl>
      <div className="empty-actions">
        {connections[0] ? (
          <button type="button" className="link-btn" onClick={() => openConsole(connections[0].id)}>
            Open console for {connections[0].name}
          </button>
        ) : (
          <button type="button" className="link-btn" onClick={() => openDataSources('new')}>
            New data source…
          </button>
        )}
      </div>
    </div>
  );
}
