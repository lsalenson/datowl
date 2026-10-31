import type { Dialect, ObjectRef } from '../api';

export function quoteIdent(name: string, dialect: Dialect): string {
  if (dialect === 'postgres') return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `\`${name.replace(/[`\\]/g, '\\$&')}\``;
}

/** `schema.table` for Postgres, `database.table` for ClickHouse. */
export function qualifiedName(object: ObjectRef, dialect: Dialect): string {
  const prefix = dialect === 'postgres' ? object.schema : object.database;
  return prefix ? `${quoteIdent(prefix, dialect)}.${quoteIdent(object.name, dialect)}` : quoteIdent(object.name, dialect);
}
