import { create } from 'zustand';

import { backend, type ObjectRef } from '@/shared/api';
import { loadJson, saveJson } from '@/shared/model/storage';

export type EditorTab =
  | { id: string; kind: 'console'; connectionId: string; name: string }
  | { id: string; kind: 'ddl'; connectionId: string; object: ObjectRef }
  | { id: string; kind: 'table'; connectionId: string; object: ObjectRef }
  /** A file of the project folder. `connectionId` runs its SQL; '' when none is attached. */
  | { id: string; kind: 'file'; connectionId: string; path: string };

interface WorkspaceStore {
  tabs: EditorTab[];
  activeId: string | null;
  /** Restores the open tabs of `projectId` and saves them under it from now on. */
  hydrate(projectId: string): void;
  activate(id: string): void;
  close(id: string): void;
  closeOthers(id: string): void;
  /** Opens the data source's default console, or the named one. */
  openConsole(connectionId: string, name?: string): void;
  newConsole(connectionId: string): Promise<void>;
  openObject(kind: 'ddl' | 'table', connectionId: string, object: ObjectRef): void;
  openFile(path: string, connectionId: string): void;
  forgetConnection(connectionId: string): void;
}

const objectKey = (o: ObjectRef) => [o.database, o.schema ?? '', o.name, o.oid ?? ''].join('.');

interface Persisted {
  tabs: EditorTab[];
  activeId: string | null;
}

// Open tabs are kept per project; `hydrate` loads them once the project is known.
let storageKey: string | null = null;

export const useWorkspace = create<WorkspaceStore>((set, get) => {
  const open = (tab: EditorTab) =>
    set((s) => ({
      tabs: s.tabs.some((t) => t.id === tab.id) ? s.tabs : [...s.tabs, tab],
      activeId: tab.id,
    }));

  return {
    tabs: [],
    activeId: null,

    hydrate: (projectId) => {
      storageKey = `datowl.workspace.${projectId}`;
      // Tabs saved before projects existed belong to the first project opened.
      const legacy = loadJson<Persisted | null>('datowl.workspace', null);
      const saved = loadJson<Persisted | null>(storageKey, null) ?? legacy ?? { tabs: [], activeId: null };
      if (legacy) localStorage.removeItem('datowl.workspace');
      set({ tabs: saved.tabs, activeId: saved.activeId });
    },

    activate: (activeId) => set({ activeId }),

    close: (id) =>
      set((s) => {
        const index = s.tabs.findIndex((t) => t.id === id);
        const tabs = s.tabs.filter((t) => t.id !== id);
        const activeId = s.activeId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : s.activeId;
        return { tabs, activeId };
      }),

    closeOthers: (id) => set((s) => ({ tabs: s.tabs.filter((t) => t.id === id), activeId: id })),

    openConsole: (connectionId, name = 'console') =>
      open({ id: `console:${connectionId}:${name}`, kind: 'console', connectionId, name }),

    newConsole: async (connectionId) => {
      const existing = new Set(await backend.listConsoles(connectionId));
      for (const t of get().tabs) if (t.kind === 'console' && t.connectionId === connectionId) existing.add(t.name);
      let name = 'console';
      for (let i = 1; existing.has(name); i++) name = `console_${i}`;
      get().openConsole(connectionId, name);
    },

    openObject: (kind, connectionId, object) =>
      open({ id: `${kind}:${connectionId}:${objectKey(object)}`, kind, connectionId, object }),

    openFile: (path, connectionId) => open({ id: `file:${path}`, kind: 'file', connectionId, path }),

    forgetConnection: (connectionId) =>
      set((s) => {
        const tabs = s.tabs.filter((t) => t.connectionId !== connectionId);
        return { tabs, activeId: tabs.some((t) => t.id === s.activeId) ? s.activeId : (tabs[0]?.id ?? null) };
      }),
  };
});

useWorkspace.subscribe((s) => {
  if (storageKey) saveJson(storageKey, { tabs: s.tabs, activeId: s.activeId } satisfies Persisted);
});

export function tabTitle(tab: EditorTab): string {
  switch (tab.kind) {
    case 'console':
      return tab.name;
    case 'file':
      return tab.path.split('/').pop() ?? tab.path;
    case 'ddl':
    case 'table':
      return tab.object.schema && tab.object.schema !== 'public' ? `${tab.object.schema}.${tab.object.name}` : tab.object.name;
  }
}
