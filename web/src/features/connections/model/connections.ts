import { create } from 'zustand';

import { backend, errorMessage, type ConnectionConfig, type SchemaSnapshot } from '@/shared/api';
import { log } from '@/shared/model/output';
import { useUi } from '@/shared/model/ui';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  serverVersion?: string;
  error?: string;
}

interface ConnectionsStore {
  list: ConnectionConfig[];
  state: Record<string, ConnectionState>;
  schema: Record<string, SchemaSnapshot>;
  load(): Promise<void>;
  save(config: ConnectionConfig, password: string | null): Promise<ConnectionConfig>;
  remove(id: string): Promise<void>;
  /** Connects if needed. Resolves `false` when the connection could not be opened. */
  ensureConnected(id: string): Promise<boolean>;
  disconnect(id: string): Promise<void>;
  refreshSchema(id: string): Promise<void>;
}

const pending = new Map<string, Promise<boolean>>();

export const useConnections = create<ConnectionsStore>((set, get) => ({
  list: [],
  state: {},
  schema: {},

  load: async () => {
    set({ list: await backend.listConnections() });
  },

  save: async (config, password) => {
    const saved = await backend.saveConnection(config, password);
    set((s) => {
      const exists = s.list.some((c) => c.id === saved.id);
      return { list: exists ? s.list.map((c) => (c.id === saved.id ? saved : c)) : [...s.list, saved] };
    });
    return saved;
  },

  remove: async (id) => {
    await backend.deleteConnection(id);
    set((s) => {
      const state = { ...s.state };
      delete state[id];
      return { list: s.list.filter((c) => c.id !== id), state };
    });
  },

  ensureConnected: (id) => {
    if (get().state[id]?.status === 'connected') return Promise.resolve(true);
    const inFlight = pending.get(id);
    if (inFlight) return inFlight;

    const attempt = (async () => {
      const config = get().list.find((c) => c.id === id);
      if (!config) return false;
      let password: string | null = null;
      if (!config.savePassword) {
        const answer = await useUi.getState().askPassword(config);
        if (answer === null) return false;
        password = answer.password;
        if (answer.remember) {
          // Into the keychain: the next connections read it from there.
          await get()
            .save({ ...config, savePassword: true }, password)
            .catch((e) => log('error', config.name, `Could not save the password: ${errorMessage(e)}`));
        }
      }
      setState(id, { status: 'connecting' });
      try {
        const { serverVersion } = await backend.connect(id, password);
        setState(id, { status: 'connected', serverVersion });
        log('success', config.name, `Connected to ${serverVersion}`);
        void get().refreshSchema(id);
        return true;
      } catch (e) {
        const error = errorMessage(e);
        setState(id, { status: 'error', error });
        log('error', config.name, `Connection failed: ${error}`);
        return false;
      }
    })().finally(() => pending.delete(id));

    pending.set(id, attempt);
    return attempt;
  },

  disconnect: async (id) => {
    await backend.disconnect(id);
    setState(id, { status: 'idle' });
    const name = get().list.find((c) => c.id === id)?.name ?? id;
    log('info', name, 'Disconnected');
  },

  refreshSchema: async (id) => {
    try {
      const snapshot = await backend.completionSchema(id);
      set((s) => ({ schema: { ...s.schema, [id]: snapshot } }));
    } catch (e) {
      log('error', 'introspection', errorMessage(e));
    }
  },
}));

function setState(id: string, state: ConnectionState) {
  useConnections.setState((s) => ({ state: { ...s.state, [id]: state } }));
}
