import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sansPiecesLocales: resolve(__dirname, 'sans-pieces-locales.html')
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 4175
  },
  preview: {
    host: '0.0.0.0',
    port: 4175
  }
});
