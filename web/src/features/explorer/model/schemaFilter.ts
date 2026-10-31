import { create } from 'zustand';

import type { ConnectionConfig, TreeNode } from '@/shared/api';
import { loadJson, saveJson } from '@/shared/model/storage';

/** Shown until picked in the filter, like DataGrip's unchecked system schemas. */
const SYSTEM = new Set(['pg_catalog', 'information_schema', 'INFORMATION_SCHEMA', 'system']);

/** Per data source: the schemas (ClickHouse: databases) to show, or `'all'`.
 *  Absent means the default: every non-system schema. */
type Choice = string[] | 'all';

interface SchemaFilterStore {
  choices: Record<string, Choice>;
  set(connectionId: string, choice: Choice | null): void;
}

const KEY = 'datowl.schemaFilter';

export const useSchemaFilter = create<SchemaFilterStore>((set) => ({
  choices: loadJson<Record<string, Choice>>(KEY, {}),
  set: (connectionId, choice) =>
    set((s) => {
      const choices = { ...s.choices };
      if (choice === null) delete choices[connectionId];
      else choices[connectionId] = choice;
      saveJson(KEY, choices);
      return { choices };
    }),
}));

/** Whether `children` is the schema level of the tree (Postgres schemas, ClickHouse databases). */
export function isSchemaLevel(children: TreeNode[], connection: ConnectionConfig): boolean {
  return children.some(
    (c) => c.node?.type === 'schema' || (connection.driver === 'clickhouse' && c.node?.type === 'database'),
  );
}

export function isShown(choice: Choice | undefined, name: string): boolean {
  if (choice === 'all') return true;
  if (choice) return choice.includes(name);
  return !SYSTEM.has(name);
}

/** The schema the data source works in by default. */
export function defaultSchema(connection: ConnectionConfig): string {
  return connection.driver === 'clickhouse' ? connection.database || 'default' : 'public';
}
