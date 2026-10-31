// Drives statement execution: streams backend events into result sets and the output log.

import { backend, errorMessage, type Row, type RunEvent } from '@/shared/api';
import { useConnections } from '@/features/connections';
import { log } from '@/shared/model/output';
import { useResults, type ResultSet } from './results';
import { useUi } from '@/shared/model/ui';
import { ResultBuffer } from '../lib/buffer';

export interface RunOptions {
  /** Editor offset of the submitted text, to place error markers. */
  baseOffset?: number;
  /** Called with the absolute editor offset of a server-reported error. */
  onErrorAt?: (offset: number, message: string) => void;
  /** Called with the message of any error, statement or transport. */
  onError?: (message: string) => void;
  /** Fixed title for the result tab (table editors). */
  title?: string;
}

let nextSetId = 1;

export async function runSql(tabId: string, connectionId: string, sql: string, options: RunOptions = {}): Promise<void> {
  const connections = useConnections.getState();
  const source = connections.list.find((c) => c.id === connectionId)?.name ?? 'unknown';
  if (!(await connections.ensureConnected(connectionId))) return;

  const results = useResults.getState();
  if (results.byTab[tabId]?.running) return;
  results.startRun(tabId);

  const offsets = new Map<number, { offset: number; sql: string }>();
  const sets = new Map<number, ResultSet>();
  let done: () => void = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));

  const onEvent = (e: RunEvent) => {
    const store = useResults.getState();
    switch (e.kind) {
      case 'statementStarted':
        offsets.set(e.index, { offset: e.offset, sql: e.sql });
        log('sql', source, e.sql);
        break;
      case 'columns': {
        const buffer = new ResultBuffer();
        buffer.setColumns(e.columns);
        const sql = offsets.get(e.index)?.sql ?? '';
        const set: ResultSet = {
          id: `r${nextSetId++}`,
          index: e.index,
          title: options.title ?? resultTitle(sql, sets.size + 1),
          sql,
          buffer,
          status: 'running',
          hasMore: false,
          truncated: false,
          elapsedMs: 0,
          resultToken: null,
          fetching: false,
        };
        sets.set(e.index, set);
        store.addSet(tabId, set);
        if (!options.title) {
          useUi.getState().setServicesVisible(true);
          useUi.getState().setBottomTab('results');
        }
        break;
      }
      case 'rows':
        sets.get(e.index)?.buffer.append(e.rows);
        break;
      case 'notice':
        log('notice', source, e.message);
        break;
      case 'statementFinished': {
        const set = sets.get(e.index);
        const time = formatMs(e.elapsedMs);
        if (set) {
          store.updateSet(tabId, set.id, {
            status: 'done',
            hasMore: e.hasMore,
            truncated: e.truncated,
            elapsedMs: e.elapsedMs,
            resultToken: e.resultToken,
          });
          const more = e.hasMore ? ' (more available)' : e.truncated ? ' (truncated)' : '';
          log('success', source, `${plural(e.rows, 'row')} retrieved starting from 1 in ${time}${more}`);
        } else if (e.rowsAffected !== null) {
          log('success', source, `${plural(e.rowsAffected, 'row')} affected in ${time}`);
        } else {
          log('success', source, `completed in ${time}`);
        }
        break;
      }
      case 'error': {
        log('error', source, e.message);
        options.onError?.(e.message);
        const set = sets.get(e.index);
        if (set) store.updateSet(tabId, set.id, { status: 'error', error: e.message });
        const statement = offsets.get(e.index);
        if (statement && e.position !== null) {
          options.onErrorAt?.((options.baseOffset ?? 0) + statement.offset + e.position - 1, e.message);
        }
        break;
      }
      case 'finished':
        for (const set of sets.values()) {
          if (useResults.getState().byTab[tabId]?.sets.find((s) => s.id === set.id)?.status === 'running') {
            store.updateSet(tabId, set.id, { status: e.cancelled ? 'cancelled' : 'done' });
          }
        }
        if (e.cancelled) log('info', source, 'Execution cancelled');
        if (sets.size === 0 && !options.title) useUi.getState().setBottomTab('output');
        store.endRun(tabId);
        done();
        break;
    }
  };

  try {
    const runId = await backend.execute(connectionId, sql, useUi.getState().pageSize, onEvent);
    if (useResults.getState().byTab[tabId]?.running) useResults.getState().setRunId(tabId, runId);
  } catch (e) {
    log('error', source, errorMessage(e));
    options.onError?.(errorMessage(e));
    useResults.getState().endRun(tabId);
    done();
  }
  return finished;
}

/** Reads the next page (or everything, with `all`) of an open result set. */
export async function fetchMore(tabId: string, connectionId: string, setId: string, all = false): Promise<void> {
  const store = useResults.getState();
  const set = store.byTab[tabId]?.sets.find((s) => s.id === setId);
  if (!set || set.fetching || !set.hasMore || set.resultToken === null) return;
  const source = useConnections.getState().list.find((c) => c.id === connectionId)?.name ?? 'unknown';

  store.updateSet(tabId, setId, { fetching: true });
  const before = set.buffer.rows.length;
  const pageSize = all ? 10_000_000 : useUi.getState().pageSize;

  await new Promise<void>((resolve) => {
    const onEvent = (e: RunEvent) => {
      const s = useResults.getState();
      switch (e.kind) {
        case 'rows':
          set.buffer.append(e.rows);
          break;
        case 'statementFinished':
          s.updateSet(tabId, setId, { hasMore: e.hasMore, resultToken: e.resultToken, fetching: false });
          log('success', source, `${plural(e.rows, 'row')} retrieved starting from ${before + 1} in ${formatMs(e.elapsedMs)}`);
          break;
        case 'error':
          s.updateSet(tabId, setId, { hasMore: false, resultToken: null, fetching: false });
          log('error', source, e.message);
          break;
        case 'finished':
          s.updateSet(tabId, setId, { fetching: false });
          s.setRunId(tabId, null);
          resolve();
          break;
      }
    };
    backend.fetchMore(connectionId, set.resultToken!, pageSize, onEvent).then(
      (runId) => useResults.getState().setRunId(tabId, runId),
      (e) => {
        useResults.getState().updateSet(tabId, setId, { hasMore: false, resultToken: null, fetching: false });
        log('error', source, errorMessage(e));
        resolve();
      },
    );
  });
}

export async function cancelRun(tabId: string): Promise<void> {
  const runId = useResults.getState().byTab[tabId]?.runId;
  if (runId != null) await backend.cancel(runId);
}

function resultTitle(sql: string, ordinal: number): string {
  const from = /\bfrom\s+((?:"[^"]+"|`[^`]+`|[\w$]+)(?:\.(?:"[^"]+"|`[^`]+`|[\w$]+))?)/i.exec(sql);
  return from ? from[1].replace(/["`]/g, '') : `Result ${ordinal}`;
}

export function formatMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}

/** Runs one statement outside any editor (explorer actions: rename, drop…), logging it to
 *  the output. Resolves with the rows of its result, rejects with the server's message. */
export async function executeStatement(connectionId: string, sql: string): Promise<Row[]> {
  const connections = useConnections.getState();
  const source = connections.list.find((c) => c.id === connectionId)?.name ?? 'unknown';
  if (!(await connections.ensureConnected(connectionId))) throw new Error('Not connected');

  const rows: Row[] = [];
  let failure: string | null = null;
  return new Promise<Row[]>((resolve, reject) => {
    const onEvent = (e: RunEvent) => {
      if (e.kind === 'statementStarted') log('sql', source, e.sql);
      else if (e.kind === 'rows') rows.push(...e.rows);
      else if (e.kind === 'notice') log('notice', source, e.message);
      else if (e.kind === 'statementFinished') {
        log('success', source, `completed in ${formatMs(e.elapsedMs)}`);
        if (e.resultToken !== null) void backend.closeResult(connectionId, e.resultToken);
      } else if (e.kind === 'error') {
        failure = e.message;
        log('error', source, e.message);
      } else if (e.kind === 'finished') {
        if (failure !== null) reject(new Error(failure));
        else resolve(rows);
      }
    };
    backend.execute(connectionId, sql, 1000, onEvent).catch((e) => {
      log('error', source, errorMessage(e));
      reject(new Error(errorMessage(e)));
    });
  });
}
