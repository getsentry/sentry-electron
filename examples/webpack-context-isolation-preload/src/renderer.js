// eslint-disable-next-line import/no-unresolved
import { init, getCurrentScope } from '@sentry/electron/renderer';

init({
  debug: true,
});

getCurrentScope().setUser({ id: 'abc-123' });

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
