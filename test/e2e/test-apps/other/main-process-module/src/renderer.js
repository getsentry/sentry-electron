// eslint-disable-next-line import/no-unresolved
import { getCurrentScope, init } from '@sentry/electron/renderer';

init({
  debug: true,
});

console.log('renderer logging');

getCurrentScope().setUser({ id: 'abc-123' });
