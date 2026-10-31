import { create } from 'zustand';

import { backend, errorMessage, type NodeRef, type TreeNode } from '@/shared/api';
import { useConnections } from '@/features/connections';

interface TreeStore {
  expanded: Record<string, boolean>;
  children: Record<string, TreeNode[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  selected: string | null;
  select(key: string | null): void;
  expand(key: string, connectionId: string, node: NodeRef): Promise<void>;
  collapse(key: string): void;
  refresh(key: string, connectionId: string, node: NodeRef): Promise<void>;
  collapseAll(): void;
  forget(connectionId: string): void;
}

export const rootKey = (connectionId: string) => `c:${connectionId}`;
export const childKey = (parent: string, child: TreeNode) => `${parent}/${child.label}`;

export const useTree = create<TreeStore>((set, get) => {
  const load = async (key: string, connectionId: string, node: NodeRef) => {
    if (!(await useConnections.getState().ensureConnected(connectionId))) {
      set((s) => ({ expanded: { ...s.expanded, [key]: false } }));
      return;
    }
    set((s) => ({ loading: { ...s.loading, [key]: true } }));
    try {
      const children = await backend.children(connectionId, node);
      set((s) => {
        const errors = { ...s.errors };
        delete errors[key];
        return { children: { ...s.children, [key]: children }, loading: { ...s.loading, [key]: false }, errors };
      });
      // Open the connected database right away, as most sessions start there.
      if (node.type === 'root') {
        const branches = children.filter((c) => c.node);
        if (branches.length === 1) void get().expand(childKey(key, branches[0]), connectionId, branches[0].node!);
      }
    } catch (e) {
      set((s) => ({ errors: { ...s.errors, [key]: errorMessage(e) }, loading: { ...s.loading, [key]: false } }));
    }
  };

  return {
    expanded: {},
    children: {},
    loading: {},
    errors: {},
    selected: null,

    select: (selected) => set({ selected }),

    expand: async (key, connectionId, node) => {
      set((s) => ({ expanded: { ...s.expanded, [key]: true } }));
      if (!get().children[key] && !get().loading[key]) await load(key, connectionId, node);
    },

    collapse: (key) => set((s) => ({ expanded: { ...s.expanded, [key]: false } })),

    refresh: async (key, connectionId, node) => {
      // Drop the cached subtree so every expanded descendant reloads too.
      set((s) => ({
        children: Object.fromEntries(Object.entries(s.children).filter(([k]) => k !== key && !k.startsWith(`${key}/`))),
        expanded: { ...s.expanded, [key]: true },
      }));
      await load(key, connectionId, node);
      if (node.type === 'root') void useConnections.getState().refreshSchema(connectionId);
    },

    collapseAll: () => set({ expanded: {} }),

    forget: (connectionId) => {
      const prefix = rootKey(connectionId);
      const keep = <T,>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).filter(([k]) => k !== prefix && !k.startsWith(`${prefix}/`)));
      set((s) => ({ children: keep(s.children), expanded: keep(s.expanded), errors: keep(s.errors) }));
    },
  };
});

// Drop the cached tree of deleted data sources, wherever they were deleted from.
useConnections.subscribe((state, previous) => {
  if (state.list === previous.list) return;
  const ids = new Set(state.list.map((c) => c.id));
  for (const c of previous.list) if (!ids.has(c.id)) useTree.getState().forget(c.id);
});
