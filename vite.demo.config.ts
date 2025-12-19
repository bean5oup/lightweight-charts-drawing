import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      'lightweight-charts-drawing': '/src/index.ts',
    },
  },
});
