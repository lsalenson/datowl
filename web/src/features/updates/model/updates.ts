// In-app updates through the Tauri updater: releases are signed with the project's key
// and published to the endpoint in tauri.conf.json (see docs/releases.md).

import { create } from 'zustand';

import { errorMessage, isTauri } from '@/shared/api';

type Status = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'error';

interface UpdatesStore {
  status: Status;
  version: string | null;
  notes: string | null;
  /** 0..1 while downloading, when the size is known. */
  progress: number | null;
  error: string | null;
  /** Hidden by "Later" until the next check finds a newer version. */
  dismissed: boolean;
  /** `manual` reports "up to date" and errors; background checks stay quiet. */
  check(manual?: boolean): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

type PendingUpdate = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>;
let pending: PendingUpdate = null;

export const useUpdates = create<UpdatesStore>((set, get) => ({
  status: 'idle',
  version: null,
  notes: null,
  progress: null,
  error: null,
  dismissed: false,

  check: async (manual = false) => {
    if (!isTauri || get().status === 'checking' || get().status === 'downloading') return;
    set({ status: 'checking', error: null });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      pending = await check();
      if (pending) {
        const fresh = pending.version !== get().version;
        set({ status: 'available', version: pending.version, notes: pending.body ?? null, dismissed: fresh ? false : get().dismissed });
      } else {
        set({ status: manual ? 'none' : 'idle', dismissed: false });
      }
    } catch (e) {
      set({ status: manual ? 'error' : 'idle', error: errorMessage(e) });
    }
  },

  install: async () => {
    if (!pending) return;
    set({ status: 'downloading', progress: null });
    try {
      let total = 0;
      let received = 0;
      await pending.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          if (total) set({ progress: received / total });
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ status: 'error', error: errorMessage(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

const SIX_HOURS = 6 * 3_600_000;

/** Checks shortly after start, then every six hours. */
export function startUpdateChecks() {
  if (!isTauri) return;
  window.setTimeout(() => void useUpdates.getState().check(), 5_000);
  window.setInterval(() => void useUpdates.getState().check(), SIX_HOURS);
}
