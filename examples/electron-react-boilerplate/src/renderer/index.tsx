import { createRoot } from 'react-dom/client';
import App from './App';
import { init } from '@sentry/electron/renderer';
import { init as reactInit } from '@sentry/react';

init({ debug: true }, reactInit);

setTimeout(() => {
  throw new Error('Some renderer error');
}, 1000);

createRoot(document.getElementById('root')!).render(<App />);
