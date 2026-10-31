// SQL behind the explorer's Rename and Drop actions, per dialect.

import type { Dialect, ObjectRef } from '@/shared/api';
import { qualifiedName, quoteIdent } from '@/shared/lib/sql';

export type Target =
  | { kind: 'object'; object: ObjectRef }
  | { kind: 'schema'; database: string; schema: string }
  | { kind: 'database'; database: string }
  | { kind: 'column'; table: ObjectRef; column: string };

const PG_OBJECT: Record<ObjectRef['kind'], string> = {
  table: 'TABLE',
  view: 'VIEW',
  materializedView: 'MATERIALIZED VIEW',
  function: 'FUNCTION',
};

export function targetName(target: Target): string {
  switch (target.kind) {
    case 'object':
      return target.object.name;
    case 'schema':
      return target.schema;
    case 'database':
      return target.database;
    case 'column':
      return target.column;
  }
}

/** What the target is called in dialogs ("table", "column"…). */
export function targetNoun(target: Target): string {
  if (target.kind !== 'object') return target.kind;
  return target.object.kind === 'materializedView' ? 'materialized view' : target.object.kind;
}

/** Postgres functions are addressed by signature (`public.f(integer)`), read from the
 *  catalog with `signatureQuery` before building the statement. */
export const needsSignature = (target: Target, dialect: Dialect) =>
  dialect === 'postgres' && target.kind === 'object' && target.object.kind === 'function';

export const signatureQuery = (object: ObjectRef) => `SELECT ${Number(object.oid)}::regprocedure::text`;

/** `ALTER … RENAME`, or null when the dialect cannot rename this target. */
export function renameSql(target: Target, newName: string, dialect: Dialect, signature?: string): string | null {
  const to = quoteIdent(newName, dialect);
  if (dialect === 'postgres') {
    switch (target.kind) {
      case 'object': {
        const { object } = target;
        if (object.kind === 'function') return signature ? `ALTER FUNCTION ${signature} RENAME TO ${to}` : null;
        return `ALTER ${PG_OBJECT[object.kind]} ${qualifiedName(object, dialect)} RENAME TO ${to}`;
      }
      case 'schema':
        return `ALTER SCHEMA ${quoteIdent(target.schema, dialect)} RENAME TO ${to}`;
      case 'column':
        return `ALTER TABLE ${qualifiedName(target.table, dialect)} RENAME COLUMN ${quoteIdent(target.column, dialect)} TO ${to}`;
      case 'database':
        // Postgres cannot rename the database the session is connected to.
        return null;
    }
  }
  switch (target.kind) {
    case 'object':
      if (target.object.kind === 'function') return null;
      return `RENAME TABLE ${qualifiedName(target.object, dialect)} TO ${quoteIdent(target.object.database, dialect)}.${to}`;
    case 'database':
      return `RENAME DATABASE ${quoteIdent(target.database, dialect)} TO ${to}`;
    case 'column':
      return `ALTER TABLE ${qualifiedName(target.table, dialect)} RENAME COLUMN ${quoteIdent(target.column, dialect)} TO ${to}`;
    case 'schema':
      return null;
  }
}

/** `DROP …`, or null when the dialect cannot drop this target from the explorer. */
export function dropSql(target: Target, dialect: Dialect, signature?: string): string | null {
  if (dialect === 'postgres') {
    switch (target.kind) {
      case 'object': {
        const { object } = target;
        if (object.kind === 'function') return signature ? `DROP FUNCTION ${signature}` : null;
        return `DROP ${PG_OBJECT[object.kind]} ${qualifiedName(object, dialect)}`;
      }
      case 'schema':
        return `DROP SCHEMA ${quoteIdent(target.schema, dialect)}`;
      case 'column':
        return `ALTER TABLE ${qualifiedName(target.table, dialect)} DROP COLUMN ${quoteIdent(target.column, dialect)}`;
      case 'database':
        return null;
    }
  }
  switch (target.kind) {
    case 'object': {
      const { object } = target;
      if (object.kind === 'function') return `DROP FUNCTION ${quoteIdent(object.name, dialect)}`;
      return `DROP ${object.kind === 'table' ? 'TABLE' : 'VIEW'} ${qualifiedName(object, dialect)}`;
    }
    case 'database':
      return `DROP DATABASE ${quoteIdent(target.database, dialect)}`;
    case 'column':
      return `ALTER TABLE ${qualifiedName(target.table, dialect)} DROP COLUMN ${quoteIdent(target.column, dialect)}`;
    case 'schema':
      return null;
  }
}

/** Whether a statement can be built at all, before asking for a name or signature. */
export const canRename = (target: Target, dialect: Dialect) => renameSql(target, 'x', dialect, 'f()') !== null;
export const canDrop = (target: Target, dialect: Dialect) => dropSql(target, dialect, 'f()') !== null;
