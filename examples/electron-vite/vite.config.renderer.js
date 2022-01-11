import { join } from 'path';

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
