import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri serves the built files; `pnpm dev` serves them to the Tauri dev window.
// `pnpm demo` runs the panel in a browser with a scripted brain and a sample
// plan; `vite build --mode demo` packs that into one self-contained page.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build:
    mode === 'demo'
      ? {
          target: 'es2022',
          outDir: process.env.DEMO_OUT ?? 'dist-demo',
          emptyOutDir: true,
          assetsInlineLimit: 10_000_000,
          cssCodeSplit: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : { target: 'safari16', outDir: 'dist' },
}));
