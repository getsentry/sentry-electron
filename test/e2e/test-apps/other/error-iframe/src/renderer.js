/* eslint-env browser */
// eslint-disable-next-line import/no-unresolved
import { init } from '@sentry/electron';

init({
  debug: true,
});

const iframe = document.createElement('iframe');
iframe.src = './iframe.html';

document.body.appendChild(iframe);
