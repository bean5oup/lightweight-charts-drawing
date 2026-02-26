import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: '.',
  base: '/lightweight-charts-drawing/',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
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
