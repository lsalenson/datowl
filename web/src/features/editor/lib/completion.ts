// Schema-aware completion: tables after FROM/JOIN, columns of the tables in scope,
// `alias.` and `schema.` qualifiers, then keywords and functions.

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

import type { Dialect, SchemaSnapshot, TableInfo } from '@/shared/api';
import { quoteIdent } from '@/shared/lib/sql';
import { useConnections } from '@/features/connections';
import { functions, keywords, NOT_ALIASES, TABLE_CONTEXT } from './keywords';

type MonacoApi = typeof Monaco;

const modelConnections = new Map<string, string>();

export function bindModel(model: Monaco.editor.ITextModel, connectionId: string) {
  modelConnections.set(model.uri.toString(), connectionId);
}

const IDENT = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|[\w$]+)`;
const TABLE_REF = new RegExp(
  String.raw`\b(?:from|join|update|into)\s+(${IDENT}(?:\s*\.\s*${IDENT})?)(?:\s+(?:as\s+)?(${IDENT}))?`,
  'gi',
);
const QUALIFIER = new RegExp(String.raw`(${IDENT})\.([\w$]*)$`);

interface TableRef {
  table: TableInfo;
  alias: string | null;
}

const unquote = (s: string) => s.trim().replace(/^["`]|["`]$/g, '');

function findTable(snapshot: SchemaSnapshot, ref: string): TableInfo | undefined {
  const parts = ref.split('.').map(unquote);
  const name = parts.at(-1)!.toLowerCase();
  const schema = parts.length > 1 ? parts[0].toLowerCase() : null;
  const candidates = snapshot.tables.filter(
    (t) => t.name.toLowerCase() === name && (schema === null || t.schema.toLowerCase() === schema),
  );
  return candidates.find((t) => t.schema === snapshot.defaultSchema) ?? candidates[0];
}

function tablesInScope(snapshot: SchemaSnapshot, statement: string): TableRef[] {
  const refs: TableRef[] = [];
  for (const match of statement.matchAll(TABLE_REF)) {
    const table = findTable(snapshot, match[1]);
    if (!table) continue;
    const alias = match[2] && !NOT_ALIASES.has(match[2].toLowerCase()) ? unquote(match[2]) : null;
    refs.push({ table, alias });
  }
  return refs;
}

/** The statement around `offset`, cut at the nearest semicolons. */
function statementAround(text: string, offset: number): { before: string; statement: string } {
  const start = text.lastIndexOf(';', offset - 1) + 1;
  const next = text.indexOf(';', offset);
  const end = next === -1 ? text.length : next;
  return { before: text.slice(start, offset), statement: text.slice(start, end) };
}

export function registerSqlCompletion(monaco: MonacoApi) {
  const { CompletionItemKind: Kind, CompletionItemInsertTextRule } = monaco.languages;

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const connectionId = modelConnections.get(model.uri.toString());
      const { list, schema } = useConnections.getState();
      const dialect: Dialect = list.find((c) => c.id === connectionId)?.driver ?? 'postgres';
      const snapshot: SchemaSnapshot = (connectionId && schema[connectionId]) || { defaultSchema: null, tables: [] };

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const { before, statement } = statementAround(model.getValue(), model.getOffsetAt(position));
      const lowercase = word.word !== '' && word.word === word.word.toLowerCase();
      const scope = tablesInScope(snapshot, statement);

      const columnItems = (refs: TableRef[], sort: string) =>
        refs.flatMap(({ table, alias }) =>
          table.columns.map((c) => ({
            label: { label: c.name, description: c.typeName, detail: `  ${alias ?? table.name}` },
            kind: Kind.Field,
            insertText: quoteIdent(c.name, dialect),
            sortText: sort + c.name,
            range,
          })),
        );

      const tableItems = (tables: TableInfo[], qualified: boolean) =>
        tables.map((t) => {
          const needsSchema = qualified && t.schema !== snapshot.defaultSchema;
          return {
            label: { label: t.name, description: t.schema },
            kind: t.kind === 'table' ? Kind.Struct : Kind.Interface,
            insertText: needsSchema ? `${quoteIdent(t.schema, dialect)}.${quoteIdent(t.name, dialect)}` : quoteIdent(t.name, dialect),
            sortText: (t.schema === snapshot.defaultSchema ? '1' : '2') + t.name,
            range,
          };
        });

      // `alias.` / `table.` / `schema.`
      const qualifier = QUALIFIER.exec(before);
      if (qualifier) {
        const q = unquote(qualifier[1]).toLowerCase();
        const byAlias = scope.filter((r) => r.alias?.toLowerCase() === q || r.table.name.toLowerCase() === q);
        if (byAlias.length) return { suggestions: columnItems(byAlias.slice(0, 1), '0') };
        const inSchema = snapshot.tables.filter((t) => t.schema.toLowerCase() === q);
        if (inSchema.length) return { suggestions: tableItems(inSchema, false) };
        const direct = findTable(snapshot, q);
        return { suggestions: direct ? columnItems([{ table: direct, alias: null }], '0') : [] };
      }

      const previous = /([\w$]+)[\s,]*$/.exec(before.slice(0, before.length - word.word.length))?.[1]?.toLowerCase();
      if (previous && TABLE_CONTEXT.has(previous)) {
        const schemas = [...new Set(snapshot.tables.map((t) => t.schema))].map((s) => ({
          label: s,
          kind: Kind.Module,
          insertText: quoteIdent(s, dialect),
          sortText: `3${s}`,
          range,
        }));
        return { suggestions: [...tableItems(snapshot.tables, true), ...schemas] };
      }

      const keywordItems = keywords(dialect).map((k) => ({
        label: k,
        kind: Kind.Keyword,
        insertText: lowercase ? k.toLowerCase() : k,
        sortText: `4${k}`,
        range,
      }));
      const functionItems = functions(dialect).map((f) => ({
        label: f,
        kind: Kind.Function,
        insertText: `${f}($0)`,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: `5${f}`,
        range,
      }));
      return {
        suggestions: [...columnItems(scope, '0'), ...tableItems(snapshot.tables, true), ...keywordItems, ...functionItems],
      };
    },
  });
}
