/// <reference types="vite/client" />

// Side-effect entry that registers every editor contribution (find, suggest, folding…).
declare module 'monaco-editor/esm/vs/editor/edcore.main';

/** App version from tauri.conf.json, injected at build time. */
declare const __APP_VERSION__: string;
