const { hookupIpc } = require('@sentry/electron/preload-namespaced');

hookupIpc('test-app');
