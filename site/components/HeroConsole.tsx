'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// The interactive bar in the hero: pick or type a query, it "runs" against demo data.

export type Result = {
  source: string;
  ms: number;
  columns: string[];
  numeric: number[];
  rows: string[][];
  note?: string;
};

export type Query = { id: string; icon: string; label: string; sql: string; result: Result };

const ORDERS: Result = {
  source: 'prod-postgres',
  ms: 21,
  columns: ['id', 'country', 'status', 'total'],
  numeric: [0, 3],
  rows: [
    ['184 203', 'FR', 'paid', '98.40'],
    ['184 202', 'DE', 'paid', '61.15'],
    ['184 201', 'ES', 'pending', '889.02'],
    ['184 200', 'IT', 'paid', '120.66'],
    ['184 199', 'BE', 'refunded', '554.90'],
  ],
};

export const QUERIES: Query[] = [
  {
    id: 'revenue',
    icon: 'chart',
    label: 'Top 5 des pays par chiffre d’affaires',
    sql: 'SELECT country, count(*) AS orders, sum(total) AS revenue FROM orders GROUP BY country ORDER BY revenue DESC LIMIT 5;',
    result: {
      source: 'prod-postgres',
      ms: 38,
      columns: ['country', 'orders', 'revenue'],
      numeric: [1, 2],
      rows: [
        ['FR', '184 203', '9 842 117.40'],
        ['DE', '142 918', '7 611 302.15'],
        ['ES', '98 404', '4 701 889.02'],
        ['IT', '87 112', '4 388 120.66'],
        ['BE', '41 730', '2 197 554.90'],
      ],
    },
  },
  {
    id: 'tables',
    icon: 'table',
    label: 'Les tables les plus volumineuses',
    sql: 'SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 5;',
    result: {
      source: 'prod-postgres',
      ms: 12,
      columns: ['relname', 'size', 'rows'],
      numeric: [1, 2],
      rows: [
        ['events_raw', '48 GB', '612 004 118'],
        ['order_items', '9 811 MB', '41 220 870'],
        ['orders', '3 204 MB', '12 480 311'],
        ['sessions', '1 772 MB', '8 001 245'],
        ['customers', '412 MB', '1 204 556'],
      ],
    },
  },
  {
    id: 'activity',
    icon: 'pulse',
    label: 'Requêtes en cours d’exécution',
    sql: "SELECT pid, usename, now() - query_start AS duration, left(query, 32) AS query FROM pg_stat_activity WHERE state = 'active';",
    result: {
      source: 'prod-postgres',
      ms: 4,
      columns: ['pid', 'usename', 'duration', 'query'],
      numeric: [0],
      rows: [
        ['48211', 'etl', '00:04:12', 'INSERT INTO events_raw SELECT …'],
        ['48356', 'analyst', '00:00:09', 'SELECT country, sum(total) …'],
        ['48402', 'api', '00:00:00', 'UPDATE sessions SET seen_at …'],
      ],
    },
  },
  {
    id: 'events',
    icon: 'clock',
    label: 'Utilisateurs uniques par heure (ClickHouse)',
    sql: 'SELECT toStartOfHour(ts) AS hour, uniq(user_id) AS users FROM analytics.events WHERE ts > now() - INTERVAL 5 HOUR GROUP BY hour ORDER BY hour;',
    result: {
      source: 'clickhouse',
      ms: 64,
      columns: ['hour', 'users'],
      numeric: [1],
      rows: [
        ['2026-10-31 05:00', '18 204'],
        ['2026-10-31 06:00', '27 911'],
        ['2026-10-31 07:00', '41 386'],
        ['2026-10-31 08:00', '58 020'],
        ['2026-10-31 09:00', '63 447'],
      ],
    },
  },
];

const SCHEMA = [
  ['orders', 'prod-postgres.public'],
  ['order_items', 'prod-postgres.public'],
  ['customers', 'prod-postgres.public'],
  ['invoices', 'prod-postgres.public'],
  ['payments', 'prod-postgres.public'],
  ['sessions', 'prod-postgres.public'],
  ['events', 'clickhouse.analytics'],
  ['events_raw', 'clickhouse.analytics'],
  ['orders_daily', 'clickhouse.analytics'],
];

const looksLikeSql = (s: string) => /^\s*(select|with|show|explain|values|table)\b/i.test(s);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ICONS: Record<string, React.ReactNode> = {
  chart: <path d="M2.5 13.5h11M4.5 11V7M8 11V3.5M11.5 11V6" />,
  table: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M6.5 6v7.5" />
    </>
  ),
  pulse: <path d="M1.5 8h3l1.5-4 3 8 1.5-4h4" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2 1.5" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="console-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

type Item = { key: string; icon: string; label: string; hint?: string; run: () => void };

// onRun reports each query that ran, so the scroll demo can replay it.
export function HeroConsole({ onRun }: { onRun?: (sql: string, result: Result) => void }) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const execute = (r: Result, sql: string) => {
    onRun?.(sql, r);
    setRunning(true);
    setResult(null);
    later(() => {
      setRunning(false);
      setResult(r);
    }, 450 + r.ms * 4);
  };

  // Types the SQL into the bar, then runs it.
  const typeAndRun = (sql: string, r: Result) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setResult(null);
    const step = Math.max(1, Math.ceil(sql.length / 40));
    for (let i = step, n = 0; i < sql.length + step; i += step, n++) {
      const slice = sql.slice(0, i);
      later(() => setText(slice), n * 14);
    }
    later(() => execute(r, sql), Math.ceil(sql.length / step) * 14 + 120);
    input.current?.focus();
  };

  const items: Item[] = useMemo(() => {
    const q = norm(text.trim());
    if (!q) return QUERIES.map((x) => ({ key: x.id, icon: x.icon, label: x.label, run: () => typeAndRun(x.sql, x.result) }));
    const known = QUERIES.find((x) => x.sql === text);
    if (known) return [];
    const fromQueries = QUERIES.filter((x) => norm(x.label).includes(q) || norm(x.sql).includes(q)).map((x) => ({
      key: x.id,
      icon: x.icon,
      label: x.label,
      run: () => typeAndRun(x.sql, x.result),
    }));
    if (looksLikeSql(text)) return fromQueries;
    const fromSchema = SCHEMA.filter(([name]) => name.includes(q)).map(([name, path]) => ({
      key: name,
      icon: 'table',
      label: name,
      hint: path,
      run: () => typeAndRun(`SELECT * FROM ${name} LIMIT 5;`, { ...ORDERS, note: name === 'orders' ? undefined : 'données d’exemple' }),
    }));
    return [...fromQueries, ...fromSchema].slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => setActive(0), [text]);

  const submit = () => {
    const known = QUERIES.find((x) => x.sql === text);
    if (known) return execute(known.result, known.sql);
    if (items[active] && !looksLikeSql(text)) return items[active].run();
    if (text.trim()) execute({ ...ORDERS, note: 'résultat d’exemple' }, text.trim());
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setText('');
    setResult(null);
    setRunning(false);
    input.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      reset();
    }
  };

  const showList = !running && !result && items.length > 0;

  return (
    <div className="console">
      <div className="console-bar">
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          onKeyDown={onKey}
          placeholder="Tapez du SQL ou cherchez une table…"
          spellCheck={false}
          autoComplete="off"
          aria-label="Console SQL de démonstration"
        />
        <button className="console-run" onClick={submit} aria-label="Exécuter" disabled={running || !text.trim()}>
          {running ? (
            <span className="spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5m0 0-6 6m6-6 6 6" />
            </svg>
          )}
        </button>
      </div>

      {showList && (
        <div className="console-pop console-list" role="listbox">
          {items.map((it, i) => (
            <button
              key={it.key}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={it.run}
            >
              <Icon name={it.icon} />
              <span className="console-label">{it.label}</span>
              {it.hint && <span className="console-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}

      {running && (
        <div className="console-pop console-status">
          <span className="spinner" /> Exécution…
        </div>
      )}

      {result && (
        <div className="console-pop console-result">
          <div className="console-table">
            <table>
              <thead>
                <tr>
                  {result.columns.map((c) => (
                    <th key={c} className={result.numeric.includes(result.columns.indexOf(c)) ? 'r' : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} style={{ animationDelay: `${i * 40}ms` }}>
                    {row.map((v, j) => (
                      <td key={j} className={result.numeric.includes(j) ? 'r n' : undefined}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="console-foot">
            <span>
              <b>●</b> {result.rows.length} lignes · {result.ms} ms · {result.source}
              {result.note && <span className="dim"> · {result.note}</span>}
            </span>
            <button onClick={reset}>Nouvelle requête</button>
          </div>
        </div>
      )}
    </div>
  );
}
