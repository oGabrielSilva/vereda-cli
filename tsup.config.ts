import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'define-cli': 'src/define-cli.ts',
    run: 'src/run.ts',
  },
  format: ['esm'],
  target: 'node18',
  dts: { resolve: true },
  sourcemap: true,
  shims: false,
  splitting: false,
  clean: true,
  treeshake: true,
  external: ['@clack/core', '@clack/prompts', 'mri', 'picocolors'],
});
