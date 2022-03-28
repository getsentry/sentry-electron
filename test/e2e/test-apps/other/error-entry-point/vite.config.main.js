import { join } from 'path';
import { builtinModules } from 'module';

const PACKAGE_ROOT = __dirname;

const config = {
  mode: 'production',
  root: PACKAGE_ROOT,
  envDir: process.cwd(),
  resolve: {
    alias: {
      '/@/': `${join(PACKAGE_ROOT, 'src')}/`,
    },
  },
  build: {
    target: 'node8',
    outDir: 'dist/main',
    assetsDir: '.',
    minify: true,
    lib: {
      entry: 'src/main/index.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron', ...builtinModules],
      output: {
        entryFileNames: '[name].js',
      },
    },
    emptyOutDir: true,
    brotliSize: false,
  },
};

export default config;
