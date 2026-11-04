import {
  Check,
  ChartColumn,
  ChevronDown,
  ChevronLast,
  ChevronRight,
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

import { backend, errorMessage } from '@/shared/api';
import { formatShortcut } from '@/shared/lib/shortcuts';
import { log } from '@/shared/model/output';
import { IconButton } from '@/shared/ui/IconButton';
import type { ResultSet } from '../model/results';
import { useUi } from '@/shared/model/ui';
import { cancelRun, fetchMore, formatMs, MAX_LOADED_ROWS, plural } from '../model/runner';
import { exportRows, type ExportFormat } from '../lib/export';
import { filterLabel, filterRows, sameFilter, type RowFilter } from '../lib/profile';
import { ProfilePanel } from './ProfilePanel';
import { ResultGrid, type SortState } from './ResultGrid';

const EXTRACTORS: [ExportFormat, string, string][] = [
  ['csv', 'CSV', 'csv'],
  ['tsv', 'TSV', 'tsv'],
  ['json', 'JSON', 'json'],
  ['markdown', 'Markdown', 'md'],
  ['insert', 'SQL Inserts', 'sql'],
];

type Delivery = 'file' | 'clipboard';

interface ToolbarProps {
  tabId: string;
  connectionId: string;
  /** Absent until data is loaded (lazy table editors). */
  set?: ResultSet;
  running?: boolean;
  onReload?: () => void;
  onDdl?: () => void;
  /** Rows left by the profile filters, when some apply. */
  view?: number[] | null;
}

/** Data toolbar: reload, stop · paging · DDL, profile ··· extractor, save, copy. */
export function DataToolbar({ tabId, connectionId, set, running, onReload, onDdl, view }: ToolbarProps) {
  useSyncExternalStore(set?.buffer.subscribe ?? noopSubscribe, set?.buffer.getVersion ?? zero);
  const openMenu = useUi((s) => s.openMenu);
  const profileVisible = useUi((s) => s.profileVisible);
  const setProfileVisible = useUi((s) => s.setProfileVisible);
  const [extractor, setExtractor] = useState<ExportFormat>('csv');
  const rows = set?.buffer.rows.length ?? 0;
  const busy = running || set?.status === 'running' || !!set?.fetching;
  const canPage = !!set?.hasMore && !busy && rows < MAX_LOADED_ROWS;
  const [delivered, setDelivered] = useState<Delivery | null>(null);

  const chooseExtractor = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(
      r.left,
      r.bottom + 4,
      EXTRACTORS.map(([format, label]) => ({
        label: format === extractor ? `${label}  ✓` : label,
        onSelect: () => setExtractor(format),
      })),
    );
  };
  const [, label, extension] = EXTRACTORS.find(([f]) => f === extractor)!;

  const deliver = async (how: Delivery, scope: 'view' | 'loaded' | 'all') => {
    if (!set) return;
    const fail = (e: unknown) =>
      void useUi.getState().ask({ title: 'Export Failed', message: errorMessage(e), confirmLabel: 'Close' });
    try {
      if (scope === 'all') await fetchMore(tabId, connectionId, set.id, true);
      const all = set.buffer.rows;
      const chosen = scope === 'view' && view ? view.map((i) => all[i]) : all;
      const text = exportRows(extractor, set.buffer.columns, chosen, set.title);
      if (how === 'clipboard') {
        await navigator.clipboard.writeText(text);
      } else {
        const name = `${set.title.replace(/[\\/:*?"<>|]+/g, '_')}.${extension}`;
        const path = await backend.exportFile(name, text);
        if (path === null) return;
        log('success', 'export', `${plural(chosen.length, 'row')} saved to ${path}`);
      }
      setDelivered(how);
      window.setTimeout(() => setDelivered(null), 1800);
    } catch (e) {
      fail(e);
    }
  };

  // What gets exported is always spelled out when it is not simply what the grid holds.
  const chooseScope = (e: MouseEvent, how: Delivery) => {
    if (!set) return;
    if (!view && !set.hasMore) return void deliver(how, 'loaded');
    const r = e.currentTarget.getBoundingClientRect();
    const count = (n: number) => n.toLocaleString('en-US');
    openMenu(r.right - 240, r.bottom + 4, [
      ...(view ? [{ label: `${count(view.length)} filtered rows`, onSelect: () => void deliver(how, 'view') }] : []),
      { label: `${count(rows)} loaded rows`, onSelect: () => void deliver(how, 'loaded') },
      ...(set.hasMore
        ? [{ label: `All rows (up to ${count(MAX_LOADED_ROWS)}), fetched first`, onSelect: () => void deliver(how, 'all') }]
        : []),
    ]);
  };

  const fetchAll = async () => {
    if (!set) return;
    const ok = await useUi.getState().ask({
      title: 'Fetch All Rows',
      message: `This loads up to ${MAX_LOADED_ROWS.toLocaleString('en-US')} rows into memory. You can stop it at any time.`,
      confirmLabel: 'Fetch',
    });
    if (ok !== null) void fetchMore(tabId, connectionId, set.id, true);
  };

  return (
    <div className="toolbar data-toolbar">
      <IconButton icon={RefreshCw} label="Reload Page" shortcut="⌘R" size={14} disabled={!onReload || busy} onClick={onReload} />
      <IconButton icon={Square} tone="stop" label="Cancel Running Statements" size={12} disabled={!busy} onClick={() => void cancelRun(tabId)} />
      <span className="toolbar-separator" />
      <span
        className="page-range"
        title={rows >= MAX_LOADED_ROWS ? `Datowl keeps at most ${MAX_LOADED_ROWS.toLocaleString('en-US')} rows` : set?.hasMore ? 'More rows are available on the server' : undefined}
      >
        {set ? `${rows.toLocaleString('en-US')}${set.hasMore ? '+' : ''} rows` : '— rows'}
      </span>
      <IconButton
        icon={ChevronRight}
        label="Load Next Page"
        size={15}
        disabled={!canPage}
        onClick={() => set && void fetchMore(tabId, connectionId, set.id)}
      />
      <IconButton
        icon={ChevronLast}
        label="Fetch All Rows"
        size={15}
        disabled={!canPage}
        onClick={() => void fetchAll()}
      />
      <span className="toolbar-separator" />
      {onDdl && (
        <button type="button" className="text-btn" title={`Show DDL (${formatShortcut('⌘B')})`} onClick={onDdl}>
          DDL
        </button>
      )}
      <button
        type="button"
        className={`text-btn with-icon${set && profileVisible ? ' active' : ''}`}
        title={`Profile Columns (${formatShortcut('⌥⌘P')})`}
        disabled={!set}
        onClick={() => setProfileVisible(!profileVisible)}
      >
        <ChartColumn size={13} strokeWidth={1.9} />
        Profile
      </button>
      <span className="toolbar-spacer" />
      {busy && (
        <span className="result-status">
          <LoaderCircle size={13} className="spin" />
        </span>
      )}
      {!busy && set && (
        <span className="result-status">
          {set.truncated ? 'truncated · ' : ''}
          {formatMs(set.elapsedMs)}
        </span>
      )}
      <button type="button" className="tool-select" onClick={chooseExtractor} title="Data extractor">
        {label} <ChevronDown size={12} />
      </button>
      <IconButton
        icon={delivered === 'file' ? Check : Download}
        label={delivered === 'file' ? 'Saved' : `Save as ${label}…`}
        size={14}
        disabled={rows === 0}
        onClick={(e) => chooseScope(e, 'file')}
      />
      <IconButton
        icon={delivered === 'clipboard' ? Check : Copy}
        label={delivered === 'clipboard' ? 'Copied' : `Copy as ${label}`}
        size={14}
        disabled={rows === 0}
        onClick={(e) => chooseScope(e, 'clipboard')}
      />
    </div>
  );
}

const NO_FILTERS: RowFilter[] = [];
const noopSubscribe = () => () => {};
const zero = () => 0;

interface Props {
  tabId: string;
  connectionId: string;
  set: ResultSet;
  onReload?: () => void;
  onDdl?: () => void;
  /** Rendered between the toolbar and the grid (table editor filters). */
  below?: ReactNode;
  sort?: SortState | null;
  onHeaderClick?: (column: string) => void;
}

export function ResultView({ tabId, connectionId, set, onReload, onDdl, below, sort, onHeaderClick }: Props) {
  const version = useSyncExternalStore(set.buffer.subscribe, set.buffer.getVersion);
  const profileVisible = useUi((s) => s.profileVisible);
  const setProfileVisible = useUi((s) => s.setProfileVisible);
  const rows = set.buffer.rows.length;

  // Profile filters belong to one result set: a reload starts unfiltered.
  const [filterState, setFilterState] = useState<{ setId: string; filters: RowFilter[] }>({ setId: set.id, filters: [] });
  const filters = filterState.setId === set.id ? filterState.filters : NO_FILTERS;
  const setFilters = (next: RowFilter[]) => setFilterState({ setId: set.id, filters: next });
  const toggleFilter = (f: RowFilter) =>
    setFilters(filters.some((g) => sameFilter(f, g)) ? filters.filter((g) => !sameFilter(f, g)) : [...filters.filter((g) => g.column !== f.column), f]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => (filters.length ? filterRows(set.buffer.rows, filters) : null), [filters, set.buffer, version]);

  const [focus, setFocus] = useState<{ index: number } | null>(null);
  const [focused, setFocused] = useState<number | null>(null);

  const onNearEnd = useCallback(() => {
    if (set.hasMore && !set.fetching && set.buffer.rows.length < MAX_LOADED_ROWS) void fetchMore(tabId, connectionId, set.id);
  }, [tabId, connectionId, set.id, set.hasMore, set.fetching]);

  return (
    <div className="result-view">
      <DataToolbar tabId={tabId} connectionId={connectionId} set={set} onReload={onReload} onDdl={onDdl} view={view} />
      {below}
      {set.status === 'error' && rows === 0 ? (
        <div className="result-error">{set.error}</div>
      ) : (
        <>
          {filters.length > 0 && (
            <div className="filter-chips">
              <span className="filter-chips-count">
                {(view?.length ?? 0).toLocaleString('en-US')} of {rows.toLocaleString('en-US')}
                {set.hasMore ? ' loaded' : ''} rows
              </span>
              {filters.map((f) => (
                <span key={filterLabel(f)} className="filter-chip" title={filterLabel(f)}>
                  <span>{filterLabel(f)}</span>
                  <button type="button" aria-label="Remove filter" onClick={() => toggleFilter(f)}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              <button type="button" className="link-btn" onClick={() => setFilters([])}>
                Clear
              </button>
            </div>
          )}
          <div className="result-body">
            <ResultGrid
              buffer={set.buffer}
              onNearEnd={onNearEnd}
              sort={sort}
              onHeaderClick={onHeaderClick}
              view={view}
              focusColumn={focus}
              onColumnFocus={setFocused}
            />
            {profileVisible && (
              <ProfilePanel
                tabId={tabId}
                connectionId={connectionId}
                set={set}
                view={view}
                filters={filters}
                onToggleFilter={toggleFilter}
                focused={focused}
                onFocus={(index) => {
                  setFocused(index);
                  setFocus({ index });
                }}
                onClose={() => setProfileVisible(false)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
