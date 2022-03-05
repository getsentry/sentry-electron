// ESM import will automatically pick the renderer entry point
import { init } from '@sentry/electron';
import { app } from 'electron';

global.process.on('uncaughtException', () => {
  app.quit();
});

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});
