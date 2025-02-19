import { defineConfig } from 'vite';
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config
export default defineConfig({
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
});
