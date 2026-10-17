import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  base: mode === 'desktop' ? './' : '/',
  build: { outDir: mode === 'desktop' ? 'dist-desktop/renderer' : 'dist', emptyOutDir: true, rolldownOptions: { input: resolve(process.cwd(), mode === 'desktop' ? 'desktop.html' : 'development.html') } },
}));
