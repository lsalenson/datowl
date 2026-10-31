import {
  CornerDownLeft,
  Database,
  Eye,
  PanelBottom,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  SquareTerminal,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useConnections } from '@/features/connections';
import { useUi } from '@/shared/model/ui';
import { tabTitle, useWorkspace } from '@/features/workspace';

interface Item {
  id: string;
  group: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  /** Shift+↵ alternative (Show DDL for tables). */
  alt?: () => void;
}

/** Subsequence match; contiguous and early matches rank higher. `null` = no match. */
function score(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct !== -1) return direct === 0 ? 0 : 1 + direct / 100;
  let j = 0;
  let gaps = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
    else if (j > 0) gaps++;
  }
  return j === q.length ? 10 + gaps : null;
}

function useItems(): Item[] {
  const connections = useConnections((s) => s.list);
  const schema = useConnections((s) => s.schema);
  const tabs = useWorkspace((s) => s.tabs);
  const activeConnection = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId)?.connectionId);

  return useMemo(() => {
    const ui = useUi.getState();
    const ws = useWorkspace.getState();
    const target = activeConnection ?? connections[0]?.id;
    const items: Item[] = [];

    if (target) {
      items.push({ id: 'new-console', group: 'Actions', title: 'New console', icon: SquareTerminal, run: () => void ws.newConsole(target) });
    }
    items.push(
      { id: 'new-source', group: 'Actions', title: 'New data source', icon: Plus, run: () => ui.openDataSources('new') },
      { id: 'sources', group: 'Actions', title: 'Data sources…', hint: '⌘;', icon: Settings2, run: () => ui.openDataSources(target ?? null) },
      { id: 'explorer', group: 'Actions', title: 'Toggle explorer', hint: '⌘1', icon: PanelLeft, run: () => ui.setExplorerVisible(!ui.explorerVisible) },
      { id: 'services', group: 'Actions', title: 'Toggle services', hint: '⌘8', icon: PanelBottom, run: () => ui.setServicesVisible(!ui.servicesVisible) },
    );

    for (const tab of tabs) {
      const name = connections.find((c) => c.id === tab.connectionId)?.name ?? '';
      items.push({ id: `tab:${tab.id}`, group: 'Open tabs', title: tabTitle(tab), hint: name, icon: tab.kind === 'console' ? SquareTerminal : tab.kind === 'table' ? Table2 : Eye, run: () => ws.activate(tab.id) });
    }

    for (const connection of connections) {
      items.push({
        id: `source:${connection.id}`,
        group: 'Data sources',
        title: connection.name,
        hint: `${connection.host}:${connection.port}`,
        icon: Database,
        run: () => ws.openConsole(connection.id),
      });
      for (const table of schema[connection.id]?.tables ?? []) {
        const object = {
          database: connection.driver === 'clickhouse' ? table.schema : connection.database,
          schema: connection.driver === 'postgres' ? table.schema : null,
          name: table.name,
          kind: table.kind,
          oid: null,
        };
        items.push({
          id: `table:${connection.id}:${table.schema}.${table.name}`,
          group: 'Tables',
          title: table.name,
          hint: `${table.schema} · ${connection.name}`,
          icon: table.kind === 'table' ? Table2 : Eye,
          run: () => ws.openObject('table', connection.id, object),
          alt: () => ws.openObject('ddl', connection.id, object),
        });
      }
    }
    return items;
  }, [connections, schema, tabs, activeConnection]);
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  return open ? <Palette /> : null;
}

function Palette() {
  const close = () => useUi.getState().setPaletteOpen(false);
  const items = useItems();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const scored = items
      .map((item) => ({ item, s: score(query.trim(), item.title) }))
      .filter((r): r is { item: Item; s: number } => r.s !== null);
    if (query.trim()) scored.sort((a, b) => a.s - b.s);
    return scored.slice(0, 80).map((r) => r.item);
  }, [items, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = (item: Item | undefined, alt = false) => {
    if (!item) return;
    close();
    (alt && item.alt ? item.alt : item.run)();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
    else if (e.key === 'Enter') choose(results[index], e.shiftKey);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
  };

  // Group headers are shown only when browsing, not while ranking a query.
  let lastGroup = '';
  return (
    <div className="overlay palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Search tables, consoles, actions…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list}>
          {results.length === 0 && <div className="palette-empty">Nothing matches “{query}”.</div>}
          {results.map((item, i) => {
            const header = !query.trim() && item.group !== lastGroup;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {header && <div className="palette-group label">{item.group}</div>}
                <button
                  type="button"
                  className={`palette-item${i === index ? ' active' : ''}`}
                  onMouseMove={() => setIndex(i)}
                  onClick={(e) => choose(item, e.shiftKey)}
                >
                  <Icon size={15} color={i === index ? 'var(--orchid)' : 'var(--text-dim)'} />
                  <span className="title">{item.title}</span>
                  {item.hint && <span className="hint">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>
              <CornerDownLeft size={10} />
            </kbd>{' '}
            open
          </span>
          <span>
            <kbd>⇧</kbd>
            <kbd>
              <CornerDownLeft size={10} />
            </kbd>{' '}
            show DDL
          </span>
        </div>
      </div>
    </div>
  );
}
