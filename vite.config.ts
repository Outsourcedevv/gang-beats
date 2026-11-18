import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  test: { environment: 'node', testTimeout: 60000 },
} as Parameters<typeof defineConfig>[0]);
