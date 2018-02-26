import { app, protocol } from 'electron';
import { tmpdir } from 'os';
import { join } from 'path';
import { Application } from 'spectron';

export const APPDATA_DIRECTORY = 'E2E_APPDATA_DIRECTORY';

export function initialiseSpectron() {
  let electronPath = join(
    __dirname,
    '..',
    '..',
    'node_modules',
    '.bin',
    'electron',
  );
  const appPath = join(__dirname, '..', '..', 'example');

  if (process.platform === 'win32') {
    electronPath += '.cmd';
  }

  return new Application({
    path: electronPath,
    args: [appPath],
    env: {
      ELECTRON_ENABLE_LOGGING: true,
      ELECTRON_ENABLE_STACK_DUMPING: true,
      NODE_ENV: 'development',
      E2E_APPDATA_DIRECTORY: tmpdir(),
    },
    startTimeout: 20000,
    chromeDriverLogPath: '../chromedriverlog.txt',
  });
}
