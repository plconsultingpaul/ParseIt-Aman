import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'jscanify': path.resolve(__dirname, 'node_modules/jscanify/src/jscanify.js'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    commonjsOptions: {
      exclude: ['fs', 'path', 'canvas', 'jsdom', 'stream', 'events'],
    },
  },
});
