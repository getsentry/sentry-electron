const { init } = require('../../../..');

init({
  dsn: 'http://37f8a2ee37c0409d8970bc7559c7c7e4@localhost:8123/277345',
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});
