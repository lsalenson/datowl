import { create } from 'zustand';

import type { ReactNode } from 'react';

import type { ConnectionConfig } from '../api';
import { loadJson, saveJson } from './storage';

export interface MenuItem {
  label?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** Section title ("Recent Projects"); not clickable. */
  header?: string;
  icon?: ReactNode;
  /** Secondary lines under the label (a path, a branch). */
  detail?: ReactNode;
  /** Small tag after the label, like DataGrip's "Beta". */
  badge?: string;
  submenu?: MenuItem[];
  onSelect?: () => void;
}

export type ToolWindowId = 'explorer' | 'files' | 'services';

/** A data source to prefill in the Data Sources dialog (from a pasted URL). */
export type SourcePrefill = Partial<Omit<ConnectionConfig, 'id'>> & { driver: ConnectionConfig['driver']; password?: string };

export interface AskOptions {
  title: string;
  message?: ReactNode;
  /** Asks for a value; the dialog resolves with it. */
  input?: {
    label: string;
    value: string;
    placeholder?: string;
    /** Masks the value (it holds a password). */
    secret?: boolean;
    /** The confirm button stays disabled until exactly this is typed. */
    matches?: string;
  };
  /** SQL shown under the message, or derived from the input as it is typed. */
  preview?: string | ((value: string) => string);
  confirmLabel?: string;
  danger?: boolean;
}

export interface PasswordAnswer {
  password: string;
  /** Save it in the keychain so the next connections do not ask. */
  remember: boolean;
}

interface PasswordRequest {
  connection: ConnectionConfig;
  /** Why the previous attempt failed. */
  error?: string;
  resolve: (answer: PasswordAnswer | null) => void;
}

interface UiStore {
  dataSourcesOpen: boolean;
  paletteOpen: boolean;
  dataSourcesSelection: string | null;
  dataSourcesPrefill: SourcePrefill | null;
  askRequest: (AskOptions & { resolve: (value: string | null) => void }) | null;
  passwordRequest: PasswordRequest | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  pageSize: number;
  explorerVisible: boolean;
  servicesVisible: boolean;
  filesVisible: boolean;
  bottomTab: 'output' | 'results';
  caret: { line: number; column: number } | null;
  /** Services fills the window, to read a large result. */
  servicesMaximized: boolean;
  /** Column profile panel next to result grids. */
  profileVisible: boolean;

  openDataSources(selection?: string | null): void;
  /** Opens the Data Sources dialog on a new data source filled from `prefill`. */
  openNewDataSource(prefill: SourcePrefill): void;
  /** In-app confirm / prompt (WebKit's window.confirm is not available in the desktop app).
   *  Resolves the input value ('' without input), or null when cancelled. */
  ask(options: AskOptions): Promise<string | null>;
  answerAsk(value: string | null): void;
  setPaletteOpen(open: boolean): void;
  closeDataSources(): void;
  askPassword(connection: ConnectionConfig, error?: string): Promise<PasswordAnswer | null>;
  answerPassword(answer: PasswordAnswer | null): void;
  openMenu(x: number, y: number, items: MenuItem[]): void;
  closeMenu(): void;
  setPageSize(size: number): void;
  setExplorerVisible(visible: boolean): void;
  setServicesVisible(visible: boolean): void;
  setFilesVisible(visible: boolean): void;
  setCaret(caret: { line: number; column: number } | null): void;
  setBottomTab(tab: 'output' | 'results'): void;
  setServicesMaximized(maximized: boolean): void;
  setProfileVisible(visible: boolean): void;
}

/** A modal holds the keyboard: global shortcuts wait until it closes. */
export const isModalOpen = () => {
  const { dataSourcesOpen, askRequest, passwordRequest } = useUi.getState();
  return dataSourcesOpen || !!askRequest || !!passwordRequest;
};

export const PAGE_SIZES = [100, 500, 1000, 5000, 20000];

export const useUi = create<UiStore>((set, get) => ({
  dataSourcesOpen: false,
  paletteOpen: false,
  dataSourcesSelection: null,
  dataSourcesPrefill: null,
  askRequest: null,
  passwordRequest: null,
  menu: null,
  pageSize: loadJson('datowl.pageSize', 500),
  explorerVisible: true,
  servicesVisible: true,
  filesVisible: false,
  bottomTab: 'output',
  caret: null,
  servicesMaximized: false,
  profileVisible: loadJson('datowl.profileVisible', false),

  openDataSources: (selection = null) => set({ dataSourcesOpen: true, dataSourcesSelection: selection, dataSourcesPrefill: null }),
  openNewDataSource: (prefill) =>
    set({ dataSourcesOpen: true, dataSourcesSelection: `new:${prefill.driver}`, dataSourcesPrefill: prefill }),
  ask: (options) =>
    new Promise((resolve) => {
      get().askRequest?.resolve(null);
      set({ askRequest: { ...options, resolve } });
    }),
  answerAsk: (value) => {
    get().askRequest?.resolve(value);
    set({ askRequest: null });
  },
  closeDataSources: () => set({ dataSourcesOpen: false }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  askPassword: (connection, error) =>
    new Promise((resolve) => {
      get().passwordRequest?.resolve(null);
      set({ passwordRequest: { connection, error, resolve } });
    }),
  answerPassword: (answer) => {
    get().passwordRequest?.resolve(answer);
    set({ passwordRequest: null });
  },
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),
  setPageSize: (pageSize) => {
    saveJson('datowl.pageSize', pageSize);
    set({ pageSize });
  },
  setExplorerVisible: (explorerVisible) => set({ explorerVisible }),
  setServicesVisible: (servicesVisible) => set({ servicesVisible }),
  setFilesVisible: (filesVisible) => set({ filesVisible }),
  setCaret: (caret) => set({ caret }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setServicesMaximized: (servicesMaximized) => set({ servicesMaximized }),
  setProfileVisible: (profileVisible) => {
    saveJson('datowl.profileVisible', profileVisible);
    set({ profileVisible });
  },
}));
