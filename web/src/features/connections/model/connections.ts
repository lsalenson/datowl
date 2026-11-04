import { create } from 'zustand';

import { backend, errorMessage, isConnectionLost, type ConnectionConfig, type SchemaSnapshot } from '@/shared/api';
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
  /** Default schema chosen in a console, by connection then tab. Lives as long as the connection. */
  consoleSchemas: Record<string, Record<string, string>>;
  setConsoleSchema(id: string, tabId: string, schema: string): void;
  load(): Promise<void>;
  save(config: ConnectionConfig, password: string | null): Promise<ConnectionConfig>;
  remove(id: string): Promise<void>;
  /** Connects if needed. Resolves `false` when the connection could not be opened. */
  ensureConnected(id: string): Promise<boolean>;
  disconnect(id: string): Promise<void>;
  /** The session died: forget it, so the next action reconnects. */
  markLost(id: string, message: string): void;
  refreshSchema(id: string): Promise<void>;
}

const pending = new Map<string, Promise<boolean>>();

export const useConnections = create<ConnectionsStore>((set, get) => ({
  list: [],
  state: {},
  schema: {},
  consoleSchemas: {},
  setConsoleSchema: (id, tabId, schema) =>
    set((s) => ({ consoleSchemas: { ...s.consoleSchemas, [id]: { ...s.consoleSchemas[id], [tabId]: schema } } })),

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
      // A data source without a saved password asks again until it connects or the user gives up.
      let refused: string | undefined;
      for (;;) {
        let password: string | null = null;
        let remember = false;
        if (!config.savePassword) {
          const answer = await useUi.getState().askPassword(config, refused);
          if (answer === null) {
            setState(id, { status: 'idle' });
            return false;
          }
          ({ password, remember } = answer);
        }
        setState(id, { status: 'connecting' });
        try {
          const { serverVersion } = await backend.connect(id, password);
          setState(id, { status: 'connected', serverVersion });
          log('success', config.name, `Connected to ${serverVersion}`);
          // Only now: a mistyped password must not end up in the keychain.
          if (remember) {
            const saved = await get()
              .save({ ...config, savePassword: true }, password)
              .catch((e) => {
                log('error', config.name, `Could not save the password: ${errorMessage(e)}`);
                return null;
              });
            if (saved && !saved.savePassword) log('error', config.name, 'The system keychain refused the password: it will be asked again.');
          }
          void get().refreshSchema(id);
          return true;
        } catch (e) {
          const error = errorMessage(e);
          setState(id, { status: 'error', error });
          log('error', config.name, `Connection failed: ${error}`);
          if (config.savePassword) {
            showOutput();
            return false;
          }
          refused = error;
        }
      }
    })().finally(() => pending.delete(id));

    pending.set(id, attempt);
    return attempt;
  },

  disconnect: async (id) => {
    await backend.disconnect(id);
    setState(id, { status: 'idle' });
    set((s) => ({ consoleSchemas: { ...s.consoleSchemas, [id]: {} } }));
    const name = get().list.find((c) => c.id === id)?.name ?? id;
    log('info', name, 'Disconnected');
  },

  markLost: (id, message) => {
    if (get().state[id]?.status !== 'connected') return;
    setState(id, { status: 'idle' });
    set((s) => ({ consoleSchemas: { ...s.consoleSchemas, [id]: {} } }));
    const name = get().list.find((c) => c.id === id)?.name ?? id;
    log('error', name, `Connection lost: ${message}. The next action reconnects; open transactions and SET values are gone.`);
    showOutput();
  },

  refreshSchema: async (id) => {
    try {
      const snapshot = await backend.completionSchema(id);
      set((s) => ({ schema: { ...s.schema, [id]: snapshot } }));
    } catch (e) {
      if (isConnectionLost(e)) get().markLost(id, errorMessage(e));
      else log('error', 'introspection', errorMessage(e));
    }
  },
}));

/** Connection problems must be seen even with the Services tool window closed. */
function showOutput() {
  const ui = useUi.getState();
  ui.setServicesVisible(true);
  ui.setBottomTab('output');
}

function setState(id: string, state: ConnectionState) {
  useConnections.setState((s) => ({ state: { ...s.state, [id]: state } }));
}
