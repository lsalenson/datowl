// Exact column profile: aggregate queries over the whole result of a statement, run on
// the explorer channel so the grid's open result set stays usable.

import { backend, errorMessage, type Column, type Dialect, type Row } from '@/shared/api';
import { quoteIdent } from '@/shared/lib/sql';
import { binLayout, emptyBins, kindOf, TOP, type ColumnProfile, type ProfileKind } from './profile';

const STARTS_QUERY: Record<Dialect, RegExp> = {
  postgres: /^(select|with|values|table)\b/i,
  clickhouse: /^(select|with)\b/i,
};
const CONCURRENCY = 4;

/** The statement without comments around it, when it is a plain query. */
export function profilableSql(sql: string, dialect: Dialect): string | null {
  let s = sql.trim();
  for (;;) {
    const end = s.startsWith('--') ? s.indexOf('\n') : s.startsWith('/*') ? s.indexOf('*/') + 1 : null;
    if (end === null) break;
    s = end < 1 ? '' : s.slice(end + 1).trim();
  }
  s = s.replace(/;\s*$/, '').trim();
  return STARTS_QUERY[dialect].test(s) ? s : null;
}

interface Sql {
  dialect: Dialect;
  from: string;
  ref(i: number): string;
}

function source(dialect: Dialect, sql: string, columns: Column[]): Sql {
  // Postgres renames the result columns, which also makes duplicate names usable.
  if (dialect === 'postgres') {
    return { dialect, from: `(${sql}) AS _p(${columns.map((_, i) => `c${i}`).join(', ')})`, ref: (i) => `_p.c${i}` };
  }
  return { dialect, from: `(${sql}) AS _p`, ref: (i) => quoteIdent(columns[i].name, dialect) };
}

/** Numeric form of a value, for histograms: Unix seconds for dates. */
function numeric(q: Sql, kind: ProfileKind, x: string): string {
  if (q.dialect === 'postgres') return kind === 'temporal' ? `extract(epoch FROM ${x})::float8` : `${x}::float8`;
  return kind === 'temporal' ? `toFloat64(toUnixTimestamp(${x}))` : `toFloat64(${x})`;
}

/** Aggregates of one column, read back by `readStats` in the same order. */
function statExprs(q: Sql, kind: ProfileKind, i: number): string[] {
  const x = q.ref(i);
  const pg = q.dialect === 'postgres';
  const text = pg ? `${x}::text` : `toString(${x})`;
  const exprs = [`count(${x})`, pg ? `count(DISTINCT ${text})` : `uniqExact(${x})`];
  switch (kind) {
    case 'number':
      return [
        ...exprs,
        pg ? `min(${x})::text` : `toString(min(${x}))`,
        pg ? `max(${x})::text` : `toString(max(${x}))`,
        pg ? `avg(${x}::float8)` : `avg(toFloat64(${x}))`,
        pg ? `stddev_pop(${x}::float8)` : `stddevPop(toFloat64(${x}))`,
        pg
          ? `array_to_string(percentile_cont(ARRAY[0.25, 0.5, 0.75]) WITHIN GROUP (ORDER BY ${x}::float8), ',')`
          : `arrayStringConcat(arrayMap(v -> toString(v), quantilesExactInclusive(0.25, 0.5, 0.75)(toFloat64(${x}))), ',')`,
      ];
    case 'temporal':
      return [
        ...exprs,
        pg ? `min(${x})::text` : `toString(min(${x}))`,
        pg ? `max(${x})::text` : `toString(max(${x}))`,
        `min(${numeric(q, kind, x)})`,
        `max(${numeric(q, kind, x)})`,
      ];
    case 'text':
      return [
        ...exprs,
        `min(${text})`,
        `max(${text})`,
        pg ? `min(length(${text}))` : `min(lengthUTF8(${text}))`,
        pg ? `max(length(${text}))` : `max(lengthUTF8(${text}))`,
        pg ? `count(*) FILTER (WHERE ${text} = '')` : `countIf(${text} = '')`,
      ];
    case 'boolean':
      return [...exprs, `min(${text})`, `max(${text})`];
  }
}

const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Turns one column's aggregates into a profile. `lo`/`hi` bound its histogram. */
function readStats(
  column: Column,
  index: number,
  kind: ProfileKind,
  total: number,
  values: (string | null)[],
): { profile: ColumnProfile; lo: number; hi: number } {
  const [nonNull, distinct, min, max, ...rest] = values;
  const profile: ColumnProfile = {
    index,
    name: column.name,
    typeName: column.typeName,
    kind,
    count: total,
    nulls: total - num(nonNull),
    distinct: num(distinct),
    top: [],
    min,
    max,
  };
  let lo = NaN;
  let hi = NaN;
  if (kind === 'number' && min !== null) {
    profile.mean = num(rest[0]);
    profile.stddev = num(rest[1]);
    const q = (rest[2] ?? '').split(',').map(Number);
    if (q.length === 3 && q.every(Number.isFinite)) profile.quartiles = q as [number, number, number];
    lo = num(min);
    hi = num(max);
  } else if (kind === 'temporal') {
    lo = num(rest[0]);
    hi = num(rest[1]);
  } else if (kind === 'text' && min !== null) {
    profile.minLength = num(rest[0]);
    profile.maxLength = num(rest[1]);
    profile.empty = num(rest[2]);
  }
  return { profile, lo, hi };
}

async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

export interface ServerProfile {
  /** Exact profiles, `null` for columns the server could not profile. */
  profiles: (ColumnProfile | null)[];
  total: number | null;
  done: boolean;
  error: string | null;
}

/** Profiles every column over the full result of `sql`. Reports progress through
 *  `onUpdate`: totals and aggregates first, then top values and histograms. */
export async function runServerProfile(
  connectionId: string,
  dialect: Dialect,
  sql: string,
  columns: Column[],
  onUpdate: (p: ServerProfile) => void,
): Promise<void> {
  const q = source(dialect, sql, columns);
  const kinds = columns.map(kindOf);
  const state: ServerProfile = { profiles: columns.map(() => null), total: null, done: false, error: null };
  const bounds: { lo: number; hi: number }[] = columns.map(() => ({ lo: NaN, hi: NaN }));
  const emit = () => onUpdate({ ...state, profiles: [...state.profiles] });
  const query = (text: string): Promise<Row[]> => backend.sideQuery(connectionId, text);
  const total = dialect === 'postgres' ? 'count(*)' : 'count()';

  const take = (i: number, totalRows: number, values: (string | null)[]) => {
    const { profile, lo, hi } = readStats(columns[i], i, kinds[i], totalRows, values);
    state.profiles[i] = profile;
    bounds[i] = { lo, hi };
  };

  // All aggregates in one scan; if one column's type rejects an aggregate, retry
  // column by column so the others still get exact numbers.
  try {
    const exprs = columns.map((_, i) => statExprs(q, kinds[i], i));
    const [row] = await query(`SELECT ${[total, ...exprs.flat()].join(', ')} FROM ${q.from}`);
    state.total = num(row[0]);
    let at = 1;
    exprs.forEach((e, i) => {
      take(i, state.total!, row.slice(at, at + e.length));
      at += e.length;
    });
  } catch (e) {
    state.error = errorMessage(e);
    await pool(
      columns.map((_, i) => async () => {
        try {
          const [row] = await query(`SELECT ${total}, ${statExprs(q, kinds[i], i).join(', ')} FROM ${q.from}`);
          state.total = num(row[0]);
          take(i, state.total, row.slice(1));
          state.error = null;
        } catch {
          // This column keeps its loaded-rows profile.
        }
      }),
      CONCURRENCY,
    );
  }
  emit();
  if (state.total === null) {
    state.done = true;
    return emit();
  }

  const tasks: (() => Promise<void>)[] = [];
  columns.forEach((_, i) => {
    const p = state.profiles[i];
    if (!p || p.count === p.nulls) return;
    const x = q.ref(i);
    const text = dialect === 'postgres' ? `${x}::text` : `toString(${x})`;
    // Every value of a unique column appears once: its top values say nothing.
    if (p.distinct < p.count - p.nulls) tasks.push(async () => {
      try {
        const rows = await query(
          `SELECT ${text} AS _pv, ${total} AS _pn FROM ${q.from} WHERE ${x} IS NOT NULL GROUP BY _pv ORDER BY _pn DESC, _pv LIMIT ${TOP}`,
        );
        state.profiles[i] = { ...state.profiles[i]!, top: rows.map((r) => [r[0] ?? '', num(r[1])]) };
        emit();
      } catch {
        // No top values for this column.
      }
    });
    const { lo, hi } = bounds[i];
    if ((kinds[i] === 'number' || kinds[i] === 'temporal') && Number.isFinite(lo) && Number.isFinite(hi)) {
      tasks.push(async () => {
        const integral = kinds[i] === 'number';
        const { bins, width } = binLayout(lo, hi, integral);
        const v = numeric(q, kinds[i], x);
        const bin =
          dialect === 'postgres'
            ? `least(floor((${v} - ${lo}) / ${width})::int, ${bins - 1})`
            : `least(toInt64(floor((${v} - ${lo}) / ${width})), ${bins - 1})`;
        try {
          const rows = await query(`SELECT ${bin} AS _pb, ${total} AS _pn FROM ${q.from} WHERE ${x} IS NOT NULL GROUP BY _pb`);
          const histogram = emptyBins(lo, hi, integral);
          for (const [b, n] of rows) {
            const k = num(b);
            if (k >= 0 && k < histogram.length) histogram[k].count += num(n);
          }
          state.profiles[i] = { ...state.profiles[i]!, histogram };
          emit();
        } catch {
          // No histogram for this column.
        }
      });
    }
  });
  await pool(tasks, CONCURRENCY);
  state.done = true;
  emit();
}
