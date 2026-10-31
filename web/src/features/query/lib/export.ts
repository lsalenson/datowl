import type { Column, Row } from '@/shared/api';

export type ExportFormat = 'tsv' | 'csv' | 'json' | 'markdown' | 'insert';

const csvCell = (v: string | null) => (v === null ? '' : /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const tsvCell = (v: string | null) => (v === null ? '' : v.replace(/[\t\n\r]/g, ' '));
const mdCell = (v: string | null) => (v === null ? '' : v.replace(/\|/g, '\\|').replace(/\n/g, ' '));
const sqlLiteral = (v: string | null, c: Column) =>
  v === null ? 'NULL' : c.numeric ? v : `'${v.replace(/'/g, "''")}'`;

export function exportRows(format: ExportFormat, columns: Column[], rows: Row[], table = 'my_table'): string {
  const names = columns.map((c) => c.name);
  switch (format) {
    case 'tsv':
      return [names, ...rows].map((r) => r.map(tsvCell).join('\t')).join('\n');
    case 'csv':
      return [names, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    case 'json':
      return JSON.stringify(rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]]))), null, 2);
    case 'markdown':
      return [
        `| ${names.map(mdCell).join(' | ')} |`,
        `| ${names.map((_, i) => (columns[i].numeric ? '---:' : '---')).join(' | ')} |`,
        ...rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
      ].join('\n');
    case 'insert':
      return rows
        .map((r) => `INSERT INTO ${table} (${names.join(', ')}) VALUES (${r.map((v, i) => sqlLiteral(v, columns[i])).join(', ')});`)
        .join('\n');
  }
}
