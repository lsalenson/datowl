import { create } from 'zustand';

export type LogLevel = 'sql' | 'info' | 'success' | 'error' | 'notice';

export interface LogEntry {
  id: number;
  time: Date;
  level: LogLevel;
  source: string;
  text: string;
}

interface OutputStore {
  entries: LogEntry[];
  log(level: LogLevel, source: string, text: string): void;
  clear(): void;
}

const MAX_ENTRIES = 2_000;
let nextId = 1;

export const useOutput = create<OutputStore>((set) => ({
  entries: [],
  log: (level, source, text) =>
    set((s) => ({
      entries: [...s.entries.slice(-(MAX_ENTRIES - 1)), { id: nextId++, time: new Date(), level, source, text }],
    })),
  clear: () => set({ entries: [] }),
}));

export const log = (level: LogLevel, source: string, text: string) => useOutput.getState().log(level, source, text);
