import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { rolldownOptions: { input: resolve(process.cwd(), 'development.html') } },
});
