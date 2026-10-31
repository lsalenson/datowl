import { ArrowDownWideNarrow, ListFilter } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { qualifiedName, quoteIdent } from '@/shared/lib/sql';
import { useConnections } from '@/features/connections';
import { tabResults, useResults } from '../model/results';
import { useWorkspace, type EditorTab } from '@/features/workspace';
import type { SortState } from './ResultGrid';
import { DataToolbar, ResultView } from './ResultView';
import { runSql } from '../model/runner';

type TableTab = Extract<EditorTab, { kind: 'table' }>;

/** Table data editor. Like DataGrip, data loads on demand (⌘R), with WHERE / ORDER BY
 *  filters under the toolbar and server-side sorting from the column headers. */
export function TableView({ tab, active }: { tab: TableTab; active: boolean }) {
  const dialect = useConnections((s) => s.list.find((c) => c.id === tab.connectionId)?.driver ?? 'postgres');
  const results = useResults(tabResults(tab.id));
  const openObject = useWorkspace((s) => s.openObject);
  const [where, setWhere] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (filter = where, order = orderBy) => {
    setError(null);
    const sql = [
      `SELECT * FROM ${qualifiedName(tab.object, dialect)}`,
      filter.trim() && `WHERE ${filter.trim()}`,
      order.trim() && `ORDER BY ${order.trim()}`,
    ]
      .filter(Boolean)
      .join(' ');
    void runSql(tab.id, tab.connectionId, sql, { title: tab.object.name, onError: setError });
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        loadRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const onHeaderClick = (column: string) => {
    const next: SortState | null =
      sort?.column !== column ? { column, direction: 'asc' } : sort.direction === 'asc' ? { column, direction: 'desc' } : null;
    const order = next ? `${quoteIdent(column, dialect)} ${next.direction.toUpperCase()}` : '';
    setSort(next);
    setOrderBy(order);
    load(where, order);
  };

  const set = results.sets[0];
  const submitOnEnter = (e: KeyboardEvent) => e.key === 'Enter' && load();
  const showDdl = () => openObject('ddl', tab.connectionId, tab.object);

  const filters = (
    <>
      <div className="filter-bar">
        <label className="filter">
          <ListFilter size={13} />
          <input value={where} placeholder="WHERE" onChange={(e) => setWhere(e.target.value)} onKeyDown={submitOnEnter} spellCheck={false} />
        </label>
        <label className="filter">
          <ArrowDownWideNarrow size={13} />
          <input
            value={orderBy}
            placeholder="ORDER BY"
            onChange={(e) => {
              setOrderBy(e.target.value);
              setSort(null);
            }}
            onKeyDown={submitOnEnter}
            spellCheck={false}
          />
        </label>
      </div>
      {error && <div className="inline-error">{error}</div>}
    </>
  );

  if (set) {
    return (
      <div className="table-view">
        <ResultView
          tabId={tab.id}
          connectionId={tab.connectionId}
          set={set}
          sort={sort}
          onHeaderClick={onHeaderClick}
          onReload={() => load()}
          onDdl={showDdl}
          below={filters}
        />
      </div>
    );
  }

  return (
    <div className="table-view">
      <DataToolbar tabId={tab.id} connectionId={tab.connectionId} running={results.running} onReload={() => load()} onDdl={showDdl} />
      {filters}
      <div className="load-data">
        <button type="button" className="link-btn" onClick={() => load()} disabled={results.running}>
          {results.running ? 'Loading…' : 'Load Data'}
        </button>
        <kbd>⌘R</kbd>
      </div>
    </div>
  );
}
