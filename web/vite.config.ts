import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app version lives in tauri.conf.json (the updater compares against it).
const tauriConf = JSON.parse(readFileSync(new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

// Tauri expects a fixed port and no screen clearing so its logs stay visible.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(tauriConf.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'safari15',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          monaco: ['monaco-editor/esm/vs/editor/edcore.main'],
          grid: ['@glideapps/glide-data-grid'],
        },
      },
    },
  },
});
