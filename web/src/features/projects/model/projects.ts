import { create } from 'zustand';

import { backend, errorMessage, type Project } from '@/shared/api';
import { parseDatagripSources } from '../lib/datagrip';
import { log } from '@/shared/model/output';

interface ProjectsStore {
  current: Project | null;
  /** Most recently opened first, the open project included. */
  list: Project[];
  load(): Promise<void>;
  /** Switches project. The page reloads so every store starts from the new project. */
  open(id: string): Promise<void>;
  /** Creates a project (from a folder, importing its DataGrip data sources) and opens it. */
  create(name: string, path: string | null): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const useProjects = create<ProjectsStore>((set, get) => ({
  current: null,
  list: [],

  load: async () => {
    const { current, projects } = await backend.listProjects();
    set({ list: projects, current: projects.find((p) => p.id === current) ?? null });
  },

  open: async (id) => {
    if (id === get().current?.id) return;
    await backend.openProject(id);
    window.location.reload();
  },

  create: async (name, path) => {
    const project = await backend.createProject(name, path);
    const files = path ? await backend.datagripSources(path).catch(() => null) : null;
    await backend.openProject(project.id);
    if (files) {
      // Imported sources ask for their password on first connect: DataGrip keeps it encrypted.
      for (const config of parseDatagripSources(files)) {
        await backend.saveConnection(config, null).catch((e) => log('error', 'import', errorMessage(e)));
      }
    }
    window.location.reload();
  },

  rename: async (id, name) => {
    const renamed = await backend.renameProject(id, name);
    set((s) => ({
      list: s.list.map((p) => (p.id === id ? renamed : p)),
      current: s.current?.id === id ? renamed : s.current,
    }));
  },

  remove: async (id) => {
    await backend.deleteProject(id);
    set((s) => ({ list: s.list.filter((p) => p.id !== id) }));
  },
}));

const BADGE_COLORS = ['#a970e0', '#e2653e', '#4b8fe0', '#3fae8c', '#d3a03a', '#d9587a', '#7b6cf0', '#5aa04a'];

/** DataGrip-style project badge: initials on a colour picked from the name. */
export function projectBadge(name: string): { initials: string; color: string } {
  const caps = name.match(/^[A-Z]{2}/)?.[0];
  const initials = caps ?? (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return { initials, color: BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length] };
}

/** `~/…` for paths in the home folder, as DataGrip shows them. */
export function displayPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~');
}
