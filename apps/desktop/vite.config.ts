import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri serves the built files; `pnpm dev` serves them to the Tauri dev window.
// `pnpm demo` runs the panel in a browser with a scripted brain and a sample plan.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'safari16', outDir: 'dist' },
});
