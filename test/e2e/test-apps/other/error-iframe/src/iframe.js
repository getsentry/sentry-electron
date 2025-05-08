// eslint-disable-next-line import/no-unresolved
import { getCurrentScope, init } from '@sentry/electron/renderer';

init({
  debug: true,
});

getCurrentScope().setUser({ id: 'abc-123' });

setTimeout(() => {
  throw new Error('Some iframe error');
}, 500);
