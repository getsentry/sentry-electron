// eslint-disable-next-line import/no-unresolved
import { init, getCurrentScope } from '@sentry/electron/renderer';

init({
  debug: true,
});

console.log('renderer logging');

getCurrentScope().setUser({ id: 'abc-123' });
