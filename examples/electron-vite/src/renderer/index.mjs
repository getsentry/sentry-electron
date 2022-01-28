import { init } from '@sentry/electron';

init({
  debug: true,
});

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
