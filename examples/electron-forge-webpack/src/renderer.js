// eslint-disable-next-line import/no-unresolved
import { init } from '@sentry/electron';

init({
  debug: true,
});

// eslint-disable-next-line no-console
console.log('👋 This message is being logged by "renderer.js", included via webpack');

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
