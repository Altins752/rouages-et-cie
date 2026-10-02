import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 100000,
    modulePreload: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
