import { app } from 'electron';

global.process.on('unhandledRejection', (error) => {
  app.quit();
});

function start() {
  // We need to do this async otherwise we get a dialog which will break CI
  //
  // Because we're using ESM in the main process, this will pick
  // up the renderer entry point and throw an error
  import('@sentry/electron').then((_Sentry) => {
    //
  });
}

start();
