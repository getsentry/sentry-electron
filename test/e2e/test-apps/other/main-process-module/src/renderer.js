// eslint-disable-next-line import/no-unresolved
import { init, getCurrentScope } from '@sentry/electron/renderer';

init({
  debug: true,
});

getCurrentScope().setUser({ id: 'abc-123' });
