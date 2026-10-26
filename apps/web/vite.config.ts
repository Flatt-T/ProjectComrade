import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/health': 'http://127.0.0.1:3001',
      // Accounts, billing, entitlements and avatars all live behind /api on the service.
      '/api': 'http://127.0.0.1:3001',
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
