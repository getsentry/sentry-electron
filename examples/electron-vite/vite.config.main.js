import { join } from 'path';
import { builtinModules } from 'module';
import { sentryVitePlugin } from '@sentry/vite-plugin';

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
  plugins: [
    sentryVitePlugin({
      authToken: 'some invalid auth token',
      org: 'some invalid org',
      project: 'some invalid project',
      telemetry: false,
      sourcemaps: {
        assets: [], // no assets to upload - we just care about injecting debug IDs
      },
      release: {
        inject: false,
      },
      errorHandler() {
        // do nothing on errors :)
        // They will happen because of the invalid auth token
      },
    }),
  ],
  build: {
    target: `node8`,
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
