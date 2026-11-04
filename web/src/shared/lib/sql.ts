import type { Dialect, ObjectRef } from '../api';

/** What a statement does to the session's transaction, or null when it leaves it as is. */
export function transactionEffect(sql: string): 'open' | 'close' | null {
  const statement = sql.replace(/^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, '').toUpperCase();
  if (/^(BEGIN|START\s+TRANSACTION)\b/.test(statement)) return 'open';
  if (/^ROLLBACK\s+(WORK\s+|TRANSACTION\s+)?TO\b/.test(statement)) return null;
  return /^(COMMIT|END|ROLLBACK|ABORT)\b/.test(statement) ? 'close' : null;
}

export function quoteIdent(name: string, dialect: Dialect): string {
  if (dialect === 'postgres') return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `\`${name.replace(/[`\\]/g, '\\$&')}\``;
}

/** `schema.table` for Postgres, `database.table` for ClickHouse. */
export function qualifiedName(object: ObjectRef, dialect: Dialect): string {
  const prefix = dialect === 'postgres' ? object.schema : object.database;
  return prefix ? `${quoteIdent(prefix, dialect)}.${quoteIdent(object.name, dialect)}` : quoteIdent(object.name, dialect);
}
