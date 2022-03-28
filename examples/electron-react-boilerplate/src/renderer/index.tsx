import { render } from 'react-dom';
import App from './App';
import * as Sentry from '@sentry/electron/renderer';

Sentry.init();

setTimeout(() => {
  throw new Error('Some renderer error');
}, 1000);

render(<App />, document.getElementById('root'));
