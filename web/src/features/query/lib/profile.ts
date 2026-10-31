import type { Column, Row } from '@/shared/api';

export type ProfileKind = 'number' | 'temporal' | 'boolean' | 'text';

/** Histogram bin; temporal bins are in Unix seconds. The last bin includes `to`. */
export interface Bin {
  from: number;
  to: number;
  count: number;
}

export interface ColumnProfile {
  index: number;
  name: string;
  typeName: string;
  kind: ProfileKind;
  count: number;
  nulls: number;
  distinct: number;
  /** Most frequent values, most frequent first. */
  top: [string, number][];
  min: string | null;
  max: string | null;
  /** Numbers only. */
  mean?: number;
  stddev?: number;
  /** Numbers only: 25th, 50th and 75th percentiles. */
  quartiles?: [number, number, number];
  /** Numbers and dates. */
  histogram?: Bin[];
  /** Text only: value lengths. */
  minLength?: number;
  maxLength?: number;
  empty?: number;
}

/** A click in the profile that narrows the grid. */
export type RowFilter =
  | { column: number; name: string; op: 'eq'; value: string }
  | { column: number; name: string; op: 'null' }
  | { column: number; name: string; op: 'notNull' }
  | { column: number; name: string; op: 'range'; kind: ProfileKind; from: number; to: number; last: boolean };

export const TOP = 10;
export const BINS = 24;
const TEMPORAL = /date|time/i;
const BOOLEAN = /^bool/i;

export function kindOf(column: Column): ProfileKind {
  if (column.numeric) return 'number';
  if (BOOLEAN.test(column.typeName)) return 'boolean';
  if (TEMPORAL.test(column.typeName) && !/interval/i.test(column.typeName)) return 'temporal';
  return 'text';
}

/** Unix seconds of a date or timestamp as Postgres and ClickHouse print them. */
export function parseTemporal(value: string): number {
  let iso = value.trim().replace(' ', 'T');
  if (/^\d{2}:\d{2}/.test(iso)) iso = `1970-01-01T${iso}`;
  iso = iso.replace(/([+-]\d{2})$/, '$1:00');
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += 'Z';
  return Date.parse(iso) / 1000;
}

const toNumber = (kind: ProfileKind, value: string) => (kind === 'temporal' ? parseTemporal(value) : Number(value));

/** Statistics of one column over rows held in the grid. Values arrive as display
 *  strings: numbers are parsed, dates read as Unix seconds. */
export function profileColumn(column: Column, index: number, rows: Row[], view?: number[] | null): ColumnProfile {
  const kind = kindOf(column);
  const counts = new Map<string, number>();
  const numbers: number[] = [];
  let count = 0;
  let nulls = 0;
  let empty = 0;
  let min: string | null = null;
  let max: string | null = null;
  let minLength = Infinity;
  let maxLength = 0;

  const n = view ? view.length : rows.length;
  for (let r = 0; r < n; r++) {
    const value = rows[view ? view[r] : r][index];
    count++;
    if (value === null) {
      nulls++;
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (kind === 'number' || kind === 'temporal') {
      const x = toNumber(kind, value);
      if (!Number.isNaN(x)) numbers.push(x);
    }
    if (kind !== 'number') {
      if (min === null || value < min) min = value;
      if (max === null || value > max) max = value;
    }
    if (kind === 'text') {
      if (value.length === 0) empty++;
      if (value.length < minLength) minLength = value.length;
      if (value.length > maxLength) maxLength = value.length;
    }
  }

  const profile: ColumnProfile = {
    index,
    name: column.name,
    typeName: column.typeName,
    kind,
    count,
    nulls,
    distinct: counts.size,
    top: [...counts].sort((a, b) => b[1] - a[1]).slice(0, TOP),
    min,
    max,
  };

  if (numbers.length > 0) {
    numbers.sort((a, b) => a - b);
    const lo = numbers[0];
    const hi = numbers[numbers.length - 1];
    profile.histogram = histogram(numbers, lo, hi, kind === 'number');
    if (kind === 'number') {
      let sum = 0;
      for (const x of numbers) sum += x;
      const mean = sum / numbers.length;
      let sq = 0;
      for (const x of numbers) sq += (x - mean) ** 2;
      profile.min = formatNumber(lo);
      profile.max = formatNumber(hi);
      profile.mean = mean;
      profile.stddev = Math.sqrt(sq / numbers.length);
      profile.quartiles = [quantile(numbers, 0.25), quantile(numbers, 0.5), quantile(numbers, 0.75)];
    }
  }
  if (kind === 'text' && counts.size > 0) {
    profile.minLength = minLength;
    profile.maxLength = maxLength;
    profile.empty = empty;
  }
  return profile;
}

/** Linear interpolation between closest ranks, like Postgres' percentile_cont. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
}

/** Bin layout shared by the loaded-rows and the server profiles: one bin per value
 *  for small integer ranges, otherwise BINS equal-width bins. */
export function binLayout(lo: number, hi: number, integral: boolean): { bins: number; width: number } {
  if (lo === hi) return { bins: 1, width: 1 };
  if (integral && Number.isInteger(lo) && Number.isInteger(hi) && hi - lo < BINS) return { bins: hi - lo + 1, width: 1 };
  return { bins: BINS, width: (hi - lo) / BINS };
}

export function emptyBins(lo: number, hi: number, integral: boolean): Bin[] {
  const { bins, width } = binLayout(lo, hi, integral);
  if (bins === 1) return [{ from: lo, to: hi, count: 0 }];
  return Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
}

function histogram(sorted: number[], lo: number, hi: number, integral: boolean): Bin[] {
  const out = emptyBins(lo, hi, integral);
  const { width } = binLayout(lo, hi, integral);
  for (const x of sorted) out[Math.min(Math.floor((x - lo) / width), out.length - 1)].count++;
  return out;
}

export function profileAll(columns: Column[], rows: Row[], view?: number[] | null): ColumnProfile[] {
  return columns.map((c, i) => profileColumn(c, i, rows, view));
}

/** Indices of the rows that pass every filter. */
export function filterRows(rows: Row[], filters: RowFilter[]): number[] {
  const tests = filters.map((f): ((row: Row) => boolean) => {
    const i = f.column;
    switch (f.op) {
      case 'eq':
        return (row) => row[i] === f.value;
      case 'null':
        return (row) => row[i] === null;
      case 'notNull':
        return (row) => row[i] !== null;
      case 'range':
        return (row) => {
          const v = row[i];
          if (v === null) return false;
          const x = toNumber(f.kind, v);
          return x >= f.from && (x < f.to || (f.last && x <= f.to));
        };
    }
  });
  const out: number[] = [];
  for (let r = 0; r < rows.length; r++) if (tests.every((t) => t(rows[r]))) out.push(r);
  return out;
}

export function filterLabel(f: RowFilter): string {
  switch (f.op) {
    case 'eq':
      return `${f.name} = ${f.value === '' ? "''" : f.value}`;
    case 'null':
      return `${f.name} IS NULL`;
    case 'notNull':
      return `${f.name} IS NOT NULL`;
    case 'range':
      return `${f.name} ∈ [${formatAxis(f.kind, f.from)}, ${formatAxis(f.kind, f.to)}${f.last ? ']' : ')'}`;
  }
}

export const sameFilter = (a: RowFilter, b: RowFilter) => filterLabel(a) === filterLabel(b);

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e12)) return n.toExponential(3);
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Bin edge as a number or, for dates, as the shortest ISO form that tells them apart. */
export function formatAxis(kind: ProfileKind, x: number): string {
  if (kind !== 'temporal') return formatNumber(x);
  const iso = new Date(x * 1000).toISOString();
  if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
  return iso.slice(0, 19).replace('T', ' ');
}

export const percent = (part: number, whole: number) =>
  whole === 0 ? '0%' : `${((100 * part) / whole).toFixed(part === whole || part === 0 ? 0 : 1)}%`;
