import {
  ChevronDown,
  File,
  FileCode2,
  FileCog,
  FileJson,
  FileKey,
  FileText,
  Folder,
  FolderOpen,
  ListTree,
  Minus,
  Plus,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { backend, errorMessage, type FileEntry } from '@/shared/api';
import { useConnections } from '@/features/connections';
import { log } from '@/shared/model/output';
import { displayPath, useProjects } from '@/features/projects';
import { useUi } from '@/shared/model/ui';
import { useWorkspace } from '@/features/workspace';
import { DriverBadge } from '@/shared/ui/NodeIcon';

const INDENT = 16;

const ICONS: [RegExp, LucideIcon, string?][] = [
  [/\.(sql|ts|tsx|js|jsx|py|rs|go|rb|java|kt|sh|css|html)$/i, FileCode2, 'kind-code'],
  [/\.(md|mdx|txt|rst)$/i, FileText, 'kind-text'],
  [/\.json$/i, FileJson],
  [/\.(ya?ml|toml|ini|conf|cfg|lock)$/i, FileCog],
  [/^\.env/i, FileKey, 'kind-env'],
];

function fileIcon(name: string): [LucideIcon, string] {
  const match = ICONS.find(([re]) => re.test(name));
  return [match?.[1] ?? File, match?.[2] ?? ''];
}

type Listing = FileEntry[] | 'loading' | { error: string };

/** Files tool window, as in DataGrip: the project folder, then "Scratches and Consoles"
 *  with the query consoles of every data source. */
export function FilesPanel() {
  const project = useProjects((s) => s.current);
  const connections = useConnections((s) => s.list);
  const state = useConnections((s) => s.state);
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const workspace = useWorkspace.getState();
  const openMenu = useUi((s) => s.openMenu);
  const hide = useUi((s) => s.setFilesVisible);
  const [consoles, setConsoles] = useState<Record<string, string[]>>({});
  const [listings, setListings] = useState<Record<string, Listing>>({});
  // Keys are folder paths, plus 'scratches', 'consoles' and data source ids.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => (project?.path ? { [project.path]: true } : {}));

  const active = tabs.find((t) => t.id === activeId);
  const target = active?.connectionId || connections[0]?.id;

  const list = useCallback(async (path: string) => {
    setListings((l) => ({ ...l, [path]: 'loading' }));
    try {
      const entries = await backend.listDir(path);
      setListings((l) => ({ ...l, [path]: entries }));
    } catch (e) {
      setListings((l) => ({ ...l, [path]: { error: errorMessage(e) } }));
    }
  }, []);

  const refreshConsoles = useCallback(async () => {
    const entries = await Promise.all(
      connections.map(async (c) => [c.id, await backend.listConsoles(c.id).catch(() => [])] as const),
    );
    setConsoles(Object.fromEntries(entries));
  }, [connections]);

  // Consoles are written to disk as they are edited, so re-list when tabs change.
  useEffect(() => {
    void refreshConsoles();
  }, [refreshConsoles, tabs.length]);

  // Load every expanded folder that has not been listed yet (the project root at start).
  useEffect(() => {
    for (const [key, open] of Object.entries(expanded)) {
      if (open && key.includes('/') && !listings[key]) void list(key);
    }
  }, [expanded, listings, list]);

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const refresh = () => {
    setListings({});
    void refreshConsoles();
  };

  const openFile = (path: string) => {
    // SQL files run against the data source of the active tab, like a console.
    const connectionId = /\.sql$/i.test(path) ? (target ?? '') : '';
    workspace.openFile(path, connectionId);
  };

  const scriptsOf = (connectionId: string) => {
    const names = new Set(consoles[connectionId] ?? []);
    for (const t of tabs) if (t.kind === 'console' && t.connectionId === connectionId) names.add(t.name);
    return [...names].sort();
  };

  const consoleMenu = (e: MouseEvent, connectionId: string, name: string) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { label: 'Open', onSelect: () => workspace.openConsole(connectionId, name) },
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        onSelect: async () => {
          const ok = await useUi.getState().ask({
            title: 'Delete File',
            message: `Delete ${name}.sql?`,
            confirmLabel: 'Delete',
            danger: true,
          });
          if (ok === null) return;
          try {
            const tab = tabs.find((t) => t.kind === 'console' && t.connectionId === connectionId && t.name === name);
            if (tab) workspace.close(tab.id);
            await backend.deleteConsole(connectionId, name);
            await refreshConsoles();
          } catch (err) {
            log('error', 'files', errorMessage(err));
          }
        },
      },
    ]);
  };

  const rows: ReactNode[] = [];
  const row = (key: string, depth: number, content: ReactNode[], props: ButtonHTMLAttributes<HTMLButtonElement>) =>
    rows.push(
      <button key={key} type="button" className="file-row" style={{ paddingLeft: 4 + depth * INDENT }} {...props}>
        {content.map((c, i) => (
          <Fragment key={i}>{c}</Fragment>
        ))}
      </button>,
    );
  const twisty = (open: boolean) => <ChevronDown size={12} className={`twisty${open ? '' : ' closed'}`} />;
  const spacer = <span className="twisty-spacer" />;

  const folder = (path: string, depth: number) => {
    const listing = listings[path];
    if (!listing || listing === 'loading') {
      rows.push(
        <div key={`${path}:loading`} className="file-note" style={{ paddingLeft: 4 + depth * INDENT + 17 }}>
          Loading…
        </div>,
      );
      return;
    }
    if ('error' in listing) {
      rows.push(
        <div key={`${path}:error`} className="file-note error" style={{ paddingLeft: 4 + depth * INDENT + 17 }}>
          {listing.error}
        </div>,
      );
      return;
    }
    for (const entry of listing) {
      if (entry.isDir) {
        const open = !!expanded[entry.path];
        row(entry.path, depth, [twisty(open), open ? <FolderOpen key="i" size={14} /> : <Folder key="i" size={14} />, <span key="n" className="file-name">{entry.name}</span>], {
          onClick: () => toggle(entry.path),
        });
        if (open) folder(entry.path, depth + 1);
      } else {
        const [Icon, kind] = fileIcon(entry.name);
        const selected = active?.kind === 'file' && active.path === entry.path;
        row(entry.path, depth, [spacer, <Icon key="i" size={14} className={kind} />, <span key="n" className="file-name">{entry.name}</span>], {
          className: `file-row${selected ? ' selected' : ''}`,
          onClick: () => openFile(entry.path),
          title: entry.path,
        });
      }
    }
  };

  if (project?.path) {
    const open = !!expanded[project.path];
    row(project.path, 0, [
      twisty(open),
      <Folder key="i" size={14} />,
      <span key="n" className="file-name strong">{project.name}</span>,
      <span key="d" className="file-detail">{displayPath(project.path)}</span>,
    ], { onClick: () => toggle(project.path!) });
    if (open) folder(project.path, 1);
  }

  const scratchesOpen = !!expanded.scratches || !project?.path;
  row('scratches', 0, [twisty(scratchesOpen), <ListTree key="i" size={14} />, <span key="n" className="file-name">Scratches and Consoles</span>], {
    onClick: () => toggle('scratches'),
  });
  if (scratchesOpen) {
    const consolesOpen = expanded.consoles !== false;
    row('consoles', 1, [twisty(consolesOpen), <Folder key="i" size={14} />, <span key="n" className="file-name">Database Consoles</span>], {
      onClick: () => setExpanded((e) => ({ ...e, consoles: !consolesOpen })),
    });
    if (consolesOpen) {
      for (const c of connections) {
        const scripts = scriptsOf(c.id);
        const open = expanded[c.id] !== false;
        row(`c:${c.id}`, 2, [
          twisty(open),
          <DriverBadge key="i" driver={c.driver} connected={state[c.id]?.status === 'connected'} />,
          <span key="n" className="file-name">{c.name}</span>,
          <span key="d" className="file-detail">{scripts.length}</span>,
        ], { onClick: () => setExpanded((e) => ({ ...e, [c.id]: !open })) });
        if (!open) continue;
        for (const name of scripts) {
          const tab = tabs.find((t) => t.kind === 'console' && t.connectionId === c.id && t.name === name);
          rows.push(
            <button
              key={`c:${c.id}:${name}`}
              type="button"
              className={`file-row${tab && tab.id === activeId ? ' selected' : ''}`}
              style={{ paddingLeft: 4 + 3 * INDENT }}
              onClick={() => workspace.openConsole(c.id, name)}
              onContextMenu={(e) => consoleMenu(e, c.id, name)}
            >
              {spacer}
              <FileCode2 size={14} className="kind-console" />
              <span className="file-name">{name}.sql</span>
            </button>,
          );
        }
      }
      if (connections.length === 0) {
        rows.push(
          <div key="no-sources" className="file-note" style={{ paddingLeft: 4 + 2 * INDENT + 17 }}>
            No data sources
          </div>,
        );
      }
    }
  }

  return (
    <section className="card files">
      <header className="card-header">
        <span className="card-title">Files</span>
        <div className="card-actions">
          <IconButton icon={Plus} label="New Query Console" size={15} disabled={!target} onClick={() => target && void workspace.newConsole(target)} />
          <IconButton icon={RefreshCw} label="Refresh" size={14} onClick={refresh} />
          <IconButton icon={Minus} label="Hide" size={14} onClick={() => hide(false)} />
        </div>
      </header>
      <div className="file-tree">{rows}</div>
    </section>
  );
}
