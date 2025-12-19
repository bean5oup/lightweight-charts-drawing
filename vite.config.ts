import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'LightweightChartsDrawing',
      formats: ['es', 'umd'],
      fileName: (format) => `lightweight-charts-drawing.${format}.js`,
    },
    rollupOptions: {
      external: ['lightweight-charts'],
      output: {
        globals: {
          'lightweight-charts': 'LightweightCharts',
        },
      },
    },
    sourcemap: true,
  },
});
