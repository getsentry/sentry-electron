// eslint-disable-next-line import/no-unresolved
import { init, configureScope } from '@sentry/electron';

init({
  debug: true,
});

configureScope((scope) => {
  scope.setUser({ id: 'abc-123' });
});

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
