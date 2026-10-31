import {
  ArrowUpToLine,
  ChartColumn,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  History,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Square,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import type { ResultSet } from '../model/results';
import { useUi } from '@/shared/model/ui';
import { cancelRun, fetchMore, formatMs } from '../model/runner';
import { exportRows, type ExportFormat } from '../lib/export';
import { filterLabel, filterRows, sameFilter, type RowFilter } from '../lib/profile';
import { ProfilePanel } from './ProfilePanel';
import { ResultGrid, type SortState } from './ResultGrid';

const EXTRACTORS: [ExportFormat, string][] = [
  ['csv', 'CSV'],
  ['tsv', 'TSV'],
  ['json', 'JSON'],
  ['markdown', 'Markdown'],
  ['insert', 'SQL Inserts'],
];

const READ_ONLY = 'not available yet';

interface ToolbarProps {
  tabId: string;
  connectionId: string;
  /** Absent until data is loaded (lazy table editors). */
  set?: ResultSet;
  running?: boolean;
  onReload?: () => void;
  onDdl?: () => void;
}

/** Data editor toolbar, in DataGrip's order: reload, history, stop · paging · row
 *  edits · DDL, search ··· extractor, export, import, view, settings. */
export function DataToolbar({ tabId, connectionId, set, running, onReload, onDdl }: ToolbarProps) {
  useSyncExternalStore(set?.buffer.subscribe ?? noopSubscribe, set?.buffer.getVersion ?? zero);
  const openMenu = useUi((s) => s.openMenu);
  const profileVisible = useUi((s) => s.profileVisible);
  const setProfileVisible = useUi((s) => s.setProfileVisible);
  const [extractor, setExtractor] = useState<ExportFormat>('csv');
  const rows = set?.buffer.rows.length ?? 0;
  const busy = running || set?.status === 'running' || !!set?.fetching;
  const canPage = !!set?.hasMore && !busy;

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
  const label = EXTRACTORS.find(([f]) => f === extractor)![1];
  const copyAll = () =>
    set && void navigator.clipboard.writeText(exportRows(extractor, set.buffer.columns, set.buffer.rows, set.title));

  return (
    <div className="toolbar data-toolbar">
      <IconButton icon={RefreshCw} label="Reload Page" shortcut="⌘R" size={14} disabled={!onReload || busy} onClick={onReload} />
      <IconButton icon={History} label={`Query History — ${READ_ONLY}`} size={14} disabled />
      <IconButton icon={Square} tone="stop" label="Cancel Running Statements" size={12} disabled={!busy} onClick={() => void cancelRun(tabId)} />
      <span className="toolbar-separator" />
      <IconButton icon={ChevronFirst} label="First Page" size={15} disabled />
      <IconButton icon={ChevronLeft} label="Previous Page" size={15} disabled />
      <span className="page-range" title={set?.hasMore ? 'More rows are available on the server' : undefined}>
        {set ? `${rows.toLocaleString('en-US')}${set.hasMore ? '+' : ''} rows` : '— rows'}
      </span>
      <IconButton
        icon={ChevronRight}
        label="Next Page"
        size={15}
        disabled={!canPage}
        onClick={() => set && void fetchMore(tabId, connectionId, set.id)}
      />
      <IconButton
        icon={ChevronLast}
        label="Last Page (fetch all rows)"
        size={15}
        disabled={!canPage}
        onClick={() => set && void fetchMore(tabId, connectionId, set.id, true)}
      />
      <span className="toolbar-separator" />
      <IconButton icon={Plus} label={`Add Row — ${READ_ONLY}`} size={15} disabled />
      <IconButton icon={Minus} label={`Delete Row — ${READ_ONLY}`} size={15} disabled />
      <IconButton icon={Undo2} label="Revert Selected" size={14} disabled />
      <IconButton icon={ArrowUpToLine} label="Submit" size={14} disabled />
      <span className="toolbar-separator" />
      {onDdl && (
        <button type="button" className="text-btn" title="Show DDL (⌘B)" onClick={onDdl}>
          DDL
        </button>
      )}
      <IconButton icon={Search} label={`Search in Results — ${READ_ONLY}`} size={14} disabled />
      <button
        type="button"
        className={`text-btn with-icon${set && profileVisible ? ' active' : ''}`}
        title="Profile Columns (⌥⌘P)"
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
      <IconButton icon={Download} label={`Export Data (copy as ${label})`} size={14} disabled={rows === 0} onClick={copyAll} />
      <IconButton icon={Upload} label={`Import Data — ${READ_ONLY}`} size={14} disabled />
      <span className="toolbar-separator" />
      <IconButton icon={Eye} label="View Options" size={14} disabled />
      <IconButton icon={Settings} label="Data Editor Settings" size={14} disabled />
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
    if (set.hasMore && !set.fetching) void fetchMore(tabId, connectionId, set.id);
  }, [tabId, connectionId, set.id, set.hasMore, set.fetching]);

  return (
    <div className="result-view">
      <DataToolbar tabId={tabId} connectionId={connectionId} set={set} onReload={onReload} onDdl={onDdl} />
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
