import { create } from 'zustand';

import { ResultBuffer } from '../lib/buffer';

export type ResultStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface ResultSet {
  id: string;
  /** Statement index within its run. */
  index: number;
  title: string;
  sql: string;
  buffer: ResultBuffer;
  status: ResultStatus;
  hasMore: boolean;
  truncated: boolean;
  elapsedMs: number;
  resultToken: number | null;
  fetching: boolean;
  error?: string;
}

export interface TabResults {
  sets: ResultSet[];
  activeSetId: string | null;
  runId: number | null;
  running: boolean;
}

interface ResultsStore {
  byTab: Record<string, TabResults>;
  startRun(tabId: string): void;
  setRunId(tabId: string, runId: number | null): void;
  endRun(tabId: string): void;
  addSet(tabId: string, set: ResultSet): void;
  updateSet(tabId: string, setId: string, patch: Partial<ResultSet>): void;
  activateSet(tabId: string, setId: string | null): void;
  closeSet(tabId: string, setId: string): void;
  dropTab(tabId: string): void;
}

const EMPTY: TabResults = { sets: [], activeSetId: null, runId: null, running: false };

export const useResults = create<ResultsStore>((set) => {
  const patchTab = (tabId: string, patch: (t: TabResults) => Partial<TabResults>) =>
    set((s) => {
      const current = s.byTab[tabId] ?? EMPTY;
      return { byTab: { ...s.byTab, [tabId]: { ...current, ...patch(current) } } };
    });

  return {
    byTab: {},
    startRun: (tabId) => patchTab(tabId, () => ({ sets: [], activeSetId: null, running: true, runId: null })),
    setRunId: (tabId, runId) => patchTab(tabId, () => ({ runId })),
    endRun: (tabId) => patchTab(tabId, () => ({ running: false, runId: null })),
    addSet: (tabId, result) => patchTab(tabId, (t) => ({ sets: [...t.sets, result], activeSetId: result.id })),
    updateSet: (tabId, setId, patch) =>
      patchTab(tabId, (t) => ({ sets: t.sets.map((r) => (r.id === setId ? { ...r, ...patch } : r)) })),
    activateSet: (tabId, activeSetId) => patchTab(tabId, () => ({ activeSetId })),
    closeSet: (tabId, setId) =>
      patchTab(tabId, (t) => {
        const sets = t.sets.filter((r) => r.id !== setId);
        return { sets, activeSetId: t.activeSetId === setId ? (sets.at(-1)?.id ?? null) : t.activeSetId };
      }),
    dropTab: (tabId) =>
      set((s) => {
        const byTab = { ...s.byTab };
        delete byTab[tabId];
        return { byTab };
      }),
  };
});

export const tabResults = (tabId: string | null) => (s: ResultsStore) => (tabId ? s.byTab[tabId] : undefined) ?? EMPTY;
