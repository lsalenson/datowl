import type { Dialect } from '@/shared/api';

const COMMON_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'USING',
  'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'WITH',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  'TRUNCATE', 'CREATE VIEW', 'CREATE INDEX', 'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST',
  'TRUE', 'FALSE', 'NULL', 'EXPLAIN', 'SHOW', 'DESCRIBE',
];

const POSTGRES_KEYWORDS = [
  'RETURNING', 'ON CONFLICT', 'DO NOTHING', 'DO UPDATE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'LATERAL', 'FILTER', 'OVER', 'PARTITION BY', 'WINDOW', 'MATERIALIZED', 'RECURSIVE', 'EXPLAIN ANALYZE',
  'VACUUM', 'ANALYZE', 'GRANT', 'REVOKE', 'CREATE SCHEMA', 'CREATE FUNCTION', 'LANGUAGE', 'PLPGSQL',
  'FOR UPDATE', 'SKIP LOCKED', 'TABLESAMPLE', 'ARRAY', 'INTERVAL',
];

const CLICKHOUSE_KEYWORDS = [
  'FINAL', 'SAMPLE', 'PREWHERE', 'ARRAY JOIN', 'LEFT ARRAY JOIN', 'GLOBAL', 'ANY', 'ASOF', 'SETTINGS',
  'FORMAT', 'ENGINE', 'MergeTree', 'ReplacingMergeTree', 'AggregatingMergeTree', 'SummingMergeTree',
  'PARTITION BY', 'PRIMARY KEY', 'TTL', 'OPTIMIZE TABLE', 'SYSTEM', 'LIMIT BY', 'WITH TOTALS',
  'WITH FILL', 'INTERVAL', 'OVER', 'MATERIALIZED VIEW', 'TO', 'POPULATE',
];

const COMMON_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'lower', 'upper', 'length', 'substring', 'trim', 'round', 'abs', 'cast', 'concat', 'now'];

const POSTGRES_FUNCTIONS = [
  'string_agg', 'array_agg', 'json_agg', 'jsonb_agg', 'json_build_object', 'jsonb_build_object', 'to_char',
  'to_date', 'to_timestamp', 'date_trunc', 'date_part', 'extract', 'age', 'current_date', 'current_timestamp',
  'generate_series', 'row_number', 'rank', 'dense_rank', 'lag', 'lead', 'first_value', 'last_value',
  'greatest', 'least', 'regexp_replace', 'regexp_matches', 'split_part', 'unnest', 'format', 'pg_size_pretty',
  'pg_total_relation_size', 'gen_random_uuid', 'jsonb_array_elements', 'jsonb_each', 'percentile_cont',
];

const CLICKHOUSE_FUNCTIONS = [
  'uniq', 'uniqExact', 'uniqCombined', 'countIf', 'sumIf', 'avgIf', 'groupArray', 'groupUniqArray', 'argMax',
  'argMin', 'any', 'anyLast', 'quantile', 'quantiles', 'quantileExact', 'topK', 'toDate', 'toDateTime',
  'toStartOfDay', 'toStartOfHour', 'toStartOfMonth', 'toStartOfWeek', 'toYYYYMM', 'toUInt64', 'toInt64',
  'toString', 'toFloat64', 'formatReadableSize', 'formatReadableQuantity', 'arrayJoin', 'arrayMap',
  'arrayFilter', 'has', 'length', 'empty', 'notEmpty', 'if', 'multiIf', 'dictGet', 'JSONExtractString',
  'splitByChar', 'replaceAll', 'positionCaseInsensitive', 'today', 'yesterday', 'dateDiff', 'runningDifference',
];

export function keywords(dialect: Dialect): string[] {
  return [...COMMON_KEYWORDS, ...(dialect === 'postgres' ? POSTGRES_KEYWORDS : CLICKHOUSE_KEYWORDS)];
}

export function functions(dialect: Dialect): string[] {
  return [...COMMON_FUNCTIONS, ...(dialect === 'postgres' ? POSTGRES_FUNCTIONS : CLICKHOUSE_FUNCTIONS)];
}

/** Words after which a table name is expected. */
export const TABLE_CONTEXT = new Set(['from', 'join', 'into', 'update', 'table', 'describe']);

/** Words that can follow a table reference and so are never its alias. */
export const NOT_ALIASES = new Set([
  'where', 'join', 'inner', 'left', 'right', 'full', 'cross', 'on', 'using', 'group', 'order', 'limit',
  'having', 'union', 'set', 'values', 'final', 'sample', 'prewhere', 'array', 'global', 'any', 'as',
  'natural', 'lateral', 'window', 'offset', 'returning', 'format', 'settings', 'except', 'intersect',
]);
