import { ChevronDown, ChevronRight, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { useConnections } from '@/features/connections';
import type { ResultSet } from '../model/results';
import { fetchMore } from '../model/runner';
import {
  formatAxis,
  formatNumber,
  percent,
  profileAll,
  sameFilter,
  type Bin,
  type ColumnProfile,
  type RowFilter,
} from '../lib/profile';
import { profilableSql, runServerProfile, type ServerProfile } from '../lib/serverProfile';

interface Props {
  tabId: string;
  connectionId: string;
  set: ResultSet;
  /** Rows left by the filters, when there are any. */
  view: number[] | null;
  filters: RowFilter[];
  onToggleFilter: (filter: RowFilter) => void;
  focused: number | null;
  onFocus: (index: number) => void;
  onClose: () => void;
}

// Exact profiles survive closing the panel and switching result tabs.
const serverCache = new Map<string, ServerProfile>();

function useServerProfile(set: ResultSet, connectionId: string, enabled: boolean) {
  const dialect = useConnections((s) => s.list.find((c) => c.id === connectionId)?.driver);
  const sql = dialect ? profilableSql(set.sql, dialect) : null;
  const [state, setState] = useState<ServerProfile | null>(() => serverCache.get(set.id) ?? null);
  const [run, setRun] = useState(0);
  const ready = enabled && !!sql && set.status === 'done' && set.buffer.columns.length > 0;

  useEffect(() => {
    if (!ready || !dialect || !sql) return;
    const cached = serverCache.get(set.id);
    if (cached && run === 0) return setState(cached);
    let live = true;
    void runServerProfile(connectionId, dialect, sql, set.buffer.columns, (p) => {
      serverCache.set(set.id, p);
      if (live) setState(p);
    });
    return () => {
      live = false;
    };
  }, [ready, dialect, sql, connectionId, set.id, set.buffer.columns, run]);

  const reason = !sql ? 'Only queries (SELECT, WITH…) can be profiled on the server' : null;
  return { server: ready ? state : null, reason, refresh: () => setRun((r) => r + 1) };
}

/** Column profile of a result set, à la Snowflake: exact statistics over the whole
 *  result from the server, or over the loaded rows; every bar and value filters the grid. */
export function ProfilePanel({ tabId, connectionId, set, view, filters, onToggleFilter, focused, onFocus, onClose }: Props) {
  const version = useSyncExternalStore(set.buffer.subscribe, set.buffer.getVersion);
  const [loaded, setLoaded] = useState<ColumnProfile[]>([]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const list = useRef<HTMLDivElement>(null);
  const { server, reason, refresh } = useServerProfile(set, connectionId, true);
  const busy = set.status === 'running' || set.fetching;
  const filtered = filters.length > 0;

  // Rows stream in by batches: debounce so a large fetch is profiled once, not per batch.
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(profileAll(set.buffer.columns, set.buffer.rows, view)), 120);
    return () => clearTimeout(timer);
  }, [set.buffer, version, view]);

  // Filters describe the grid, so they switch the panel to the rows left in it.
  const exact = !filtered && !!server && server.total !== null;
  const profiles = useMemo(
    () =>
      loaded.map((p, i) => {
        const s = exact ? server!.profiles[i] : null;
        if (!s) return { profile: p, exact: false };
        return { profile: { ...s, top: s.top.length ? s.top : p.top, histogram: s.histogram ?? p.histogram }, exact: true };
      }),
    [loaded, exact, server],
  );

  useEffect(() => {
    if (focused === null) return;
    setOpen((o) => ({ ...o, [focused]: true }));
    list.current?.querySelector(`[data-column="${focused}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  const rows = set.buffer.rows.length;
  const needle = filter.trim().toLowerCase();
  const shown = needle ? profiles.filter((p) => p.profile.name.toLowerCase().includes(needle)) : profiles;
  const computing = exact && !server!.done;

  let scope: string;
  if (filtered) scope = `${(view?.length ?? 0).toLocaleString('en-US')} of ${rows.toLocaleString('en-US')} loaded rows`;
  else if (exact) scope = `${server!.total!.toLocaleString('en-US')} rows · exact`;
  else scope = `${rows.toLocaleString('en-US')}${set.hasMore ? '+' : ''} loaded rows`;

  return (
    <aside className="profile-panel">
      <header className="profile-header">
        <span className="profile-title">Profile</span>
        <span className="profile-scope" title={exact ? 'Computed by the server over the full result' : reason ?? undefined}>
          {scope}
        </span>
        <span className="toolbar-spacer" />
        {(busy || computing || (!server && !reason && set.status === 'done')) && <LoaderCircle size={13} className="spin" />}
        {exact && !computing && <IconButton icon={RefreshCw} label="Recompute Profile" size={13} onClick={refresh} />}
        <IconButton icon={X} label="Close Profile" size={14} onClick={onClose} />
      </header>
      {filtered && <div className="profile-note">Filtered by the profile: statistics of the rows shown in the grid.</div>}
      {!filtered && !exact && set.hasMore && (
        <div className="profile-note warn">
          <span title={server?.error ?? undefined}>{reason ?? 'The server profile is unavailable.'}</span> Based on the first {rows.toLocaleString('en-US')} rows.
          <button type="button" className="link-btn" disabled={busy} onClick={() => void fetchMore(tabId, connectionId, set.id, true)}>
            Fetch all rows
          </button>
        </div>
      )}
      {profiles.length > 6 && (
        <label className="filter profile-filter">
          <Search size={13} />
          <input value={filter} placeholder="Filter columns" onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
        </label>
      )}
      <div className="profile-list" ref={list}>
        {shown.map(({ profile, exact }) => (
          <ColumnCard
            key={profile.index}
            profile={profile}
            exact={exact}
            open={!!open[profile.index]}
            focused={focused === profile.index}
            filters={filters.filter((f) => f.column === profile.index)}
            onToggle={() => {
              setOpen((o) => ({ ...o, [profile.index]: !o[profile.index] }));
              onFocus(profile.index);
            }}
            onFilter={onToggleFilter}
          />
        ))}
        {rows === 0 && !busy && <div className="grid-empty">No rows to profile</div>}
      </div>
    </aside>
  );
}

interface CardProps {
  profile: ColumnProfile;
  exact: boolean;
  open: boolean;
  focused: boolean;
  filters: RowFilter[];
  onToggle: () => void;
  onFilter: (filter: RowFilter) => void;
}

function ColumnCard({ profile: p, exact, open, focused, filters, onToggle, onFilter }: CardProps) {
  const present = p.count - p.nulls;
  const unique = present > 0 && p.distinct === present;
  const Chevron = open ? ChevronDown : ChevronRight;
  const base = { column: p.index, name: p.name };
  const nullFilter: RowFilter = { ...base, op: 'null' };
  const isActive = (f: RowFilter) => filters.some((g) => sameFilter(f, g));

  return (
    <section className={`profile-card${open ? ' open' : ''}${focused ? ' focused' : ''}`} data-column={p.index}>
      <button type="button" className="profile-card-head" onClick={onToggle}>
        <Chevron size={13} />
        <span className="profile-name">{p.name}</span>
        <span className="profile-type">{p.typeName}</span>
      </button>
      <div className="profile-summary">
        <Chart profile={p} onFilter={onFilter} isActive={isActive} large={open} />
        <div className="profile-badges">
          <button
            type="button"
            className={`${p.nulls ? 'warn' : ''}${isActive(nullFilter) ? ' active' : ''}`}
            title={p.nulls ? `${p.nulls.toLocaleString('en-US')} nulls — click to show them` : 'No nulls'}
            disabled={!p.nulls}
            onClick={() => onFilter(nullFilter)}
          >
            {percent(p.nulls, p.count)} null
          </button>
          <span title={`${p.distinct.toLocaleString('en-US')} distinct non-null values${exact ? '' : ' (loaded rows)'}`}>
            {unique ? 'unique' : `${compact(p.distinct)} distinct`}
          </span>
        </div>
      </div>
      {open && <Details profile={p} exact={exact} onFilter={onFilter} isActive={isActive} />}
    </section>
  );
}

interface ChartProps {
  profile: ColumnProfile;
  onFilter: (filter: RowFilter) => void;
  isActive: (filter: RowFilter) => boolean;
  large?: boolean;
}

/** Histogram for numbers and dates, the leading value's share for everything else. */
function Chart({ profile: p, onFilter, isActive, large }: ChartProps) {
  const present = p.count - p.nulls;
  if (present === 0) return <div className="profile-histogram empty">all null</div>;
  if (p.histogram && p.histogram.length > 1) {
    return <Histogram profile={p} bins={p.histogram} onFilter={onFilter} isActive={isActive} large={large} />;
  }
  if (p.distinct === present && p.distinct > 1) {
    return (
      <div className="profile-range" title={`${p.min} → ${p.max}`}>
        <em>{display(p.min ?? '')}</em>
        <span>→</span>
        <em>{display(p.max ?? '')}</em>
      </div>
    );
  }
  const leader = p.top[0];
  if (!leader) return <div className="profile-histogram empty" />;
  const f: RowFilter = { column: p.index, name: p.name, op: 'eq', value: leader[0] };
  return (
    <button
      type="button"
      className={`profile-share${isActive(f) ? ' active' : ''}`}
      title={`${leader[0]}: ${leader[1].toLocaleString('en-US')} — click to filter`}
      onClick={() => onFilter(f)}
    >
      <span style={{ width: `${(100 * leader[1]) / present}%` }} />
      <em>{display(leader[0])}</em>
    </button>
  );
}

function Histogram({ profile: p, bins, onFilter, isActive, large }: ChartProps & { bins: Bin[] }) {
  const peak = Math.max(...bins.map((b) => b.count));
  const last = bins.length - 1;
  const filterOf = (b: Bin, i: number): RowFilter => ({
    column: p.index,
    name: p.name,
    op: 'range',
    kind: p.kind,
    from: b.from,
    to: b.to,
    last: i === last,
  });
  return (
    <div className={`profile-histogram-wrap${large ? ' large' : ''}`}>
      <div className="profile-histogram">
        {bins.map((b, i) => {
          const f = filterOf(b, i);
          return (
            <button
              type="button"
              key={i}
              className={isActive(f) ? 'active' : undefined}
              disabled={!b.count}
              title={`${formatAxis(p.kind, b.from)} – ${formatAxis(p.kind, b.to)}\n${b.count.toLocaleString('en-US')} rows — click to filter`}
              onClick={() => onFilter(f)}
            >
              <span style={{ height: `${Math.max((100 * b.count) / peak, b.count ? 4 : 0)}%` }} />
            </button>
          );
        })}
      </div>
      {large && (
        <div className="profile-axis">
          <span>{formatAxis(p.kind, bins[0].from)}</span>
          <span>{formatAxis(p.kind, bins[last].to)}</span>
        </div>
      )}
    </div>
  );
}

function Details({ profile: p, exact, onFilter, isActive }: { profile: ColumnProfile; exact: boolean } & Omit<ChartProps, 'profile'>) {
  const present = p.count - p.nulls;
  const stats: [string, string][] = [
    ['Rows', p.count.toLocaleString('en-US')],
    ['Nulls', `${p.nulls.toLocaleString('en-US')} (${percent(p.nulls, p.count)})`],
    ['Distinct', `${p.distinct.toLocaleString('en-US')} (${percent(p.distinct, present)})`],
  ];
  if (p.kind === 'number' && p.min !== null) {
    stats.push(['Min', p.min], ['Max', p.max ?? '—']);
    if (p.mean !== undefined && Number.isFinite(p.mean)) stats.push(['Mean', formatNumber(p.mean)]);
    if (p.quartiles) {
      stats.push(['Q1', formatNumber(p.quartiles[0])], ['Median', formatNumber(p.quartiles[1])], ['Q3', formatNumber(p.quartiles[2])]);
    }
    if (p.stddev !== undefined && Number.isFinite(p.stddev)) stats.push(['Std dev', formatNumber(p.stddev)]);
  } else if (p.min !== null) {
    stats.push(['Min', display(p.min)], ['Max', display(p.max ?? '')]);
  }
  if (p.kind === 'text' && p.maxLength !== undefined) {
    stats.push(['Length', `${p.minLength} – ${p.maxLength}`], ['Empty', (p.empty ?? 0).toLocaleString('en-US')]);
  }

  return (
    <div className="profile-details">
      {p.quartiles && p.min !== null && p.max !== null && <BoxPlot min={Number(p.min.replace(/,/g, ''))} max={Number(p.max.replace(/,/g, ''))} q={p.quartiles} />}
      <dl>
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd title={v}>{v}</dd>
          </div>
        ))}
      </dl>
      {p.top.length > 0 && p.distinct < present && (
        <>
          <div className="profile-subtitle">
            Top values{!exact && ' · loaded rows'}
            {p.distinct > p.top.length && <span> · {p.top.length} of {p.distinct.toLocaleString('en-US')}</span>}
          </div>
          <ol className="profile-top">
            {p.top.map(([value, count]) => {
              const f: RowFilter = { column: p.index, name: p.name, op: 'eq', value };
              return (
                <li key={value}>
                  <button
                    type="button"
                    className={isActive(f) ? 'active' : undefined}
                    title={`${value}\n${count.toLocaleString('en-US')} rows — click to filter`}
                    onClick={() => onFilter(f)}
                  >
                    <span className="bar" style={{ width: `${(100 * count) / present}%` }} />
                    <span className="value">{display(value)}</span>
                    <span className="count">
                      {compact(count)} · {percent(count, present)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

/** Min, quartiles and max on one line. */
function BoxPlot({ min, max, q }: { min: number; max: number; q: [number, number, number] }) {
  if (!(max > min)) return null;
  const at = (x: number) => `${(100 * (x - min)) / (max - min)}%`;
  return (
    <div className="profile-box" title={`min ${formatNumber(min)} · Q1 ${formatNumber(q[0])} · median ${formatNumber(q[1])} · Q3 ${formatNumber(q[2])} · max ${formatNumber(max)}`}>
      <span className="whisker" />
      <span className="box" style={{ left: at(q[0]), width: `calc(${at(q[2])} - ${at(q[0])})` }} />
      <span className="median" style={{ left: at(q[1]) }} />
    </div>
  );
}

const display = (v: string) => (v === '' ? '<empty>' : v.length > 80 ? `${v.slice(0, 80)}…` : v);
const compact = (n: number) => n.toLocaleString('en-US', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 });
