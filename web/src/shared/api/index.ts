import type { Backend } from './backend';
import { mockBackend } from './mock';
import { tauriBackend } from './tauri';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** In a plain browser (`npm run dev`), a demo backend stands in for Rust. */
export const backend: Backend = isTauri ? tauriBackend : mockBackend;

export * from './types';
