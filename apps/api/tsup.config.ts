import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/seed.ts', 'scripts/create-admin.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  dts: false,
  // Inline the workspace package (it ships raw .ts via its exports map).
  noExternal: [/^@smsgecko\/shared/],
});
