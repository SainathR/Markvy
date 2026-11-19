import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { version } from './package.json';

export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  // Simulated-core build for the Playwright screen tests; the normal build never includes it.
  ...(mode === 'webtest' ? { build: { outDir: 'dist-webtest', rollupOptions: { input: 'webtest.html' } } } : {}),
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
}));