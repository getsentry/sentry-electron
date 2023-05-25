import { join } from 'path';
import vue from '@vitejs/plugin-vue';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const PACKAGE_ROOT = __dirname;

const config = {
  mode: 'production',
  root: PACKAGE_ROOT,
  resolve: {
    alias: {
      '/@/': `${join(PACKAGE_ROOT, 'src')}/`,
    },
  },
  base: '',
  server: {
    fs: {
      strict: true,
    },
  },
  plugins: [
    vue(),
    sentryVitePlugin({
      authToken: 'some invalid auth token',
      org: 'some invalid org',
      project: 'some invalid project',
      telemetry: false,
      sourcemaps: {
        assets: [], // no assets to upload - we just care about injecting debug IDs
      },
      errorHandler() {
        // do nothing on errors :)
        // They will happen because of the invalid auth token
      },
    }),
  ],
  build: {
    sourcemap: true,
    target: `chrome61`,
    outDir: 'dist/renderer',
    assetsDir: '.',
    emptyOutDir: true,
    brotliSize: false,
  },
};

export default config;
