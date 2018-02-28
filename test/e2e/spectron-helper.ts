import { join } from 'path';
import { Application } from 'spectron';
import * as tmpdir from 'temporary-directory';

export interface TestContext {
  app: Application;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function getTestContext(): Promise<TestContext> {
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

  const [tempUserDataPath, cleanupUserData] = await getTempDir();

  const app = new Application({
    path: electronPath,
    args: [appPath],
    env: {
      ELECTRON_ENABLE_LOGGING: true,
      ELECTRON_ENABLE_STACK_DUMPING: true,
      NODE_ENV: 'development',
      E2E_APPDATA_DIRECTORY: tempUserDataPath,
    },
    startTimeout: 20000,
    chromeDriverLogPath: '../chromedriverlog.txt',
  });

  return {
    app,
    start: async () => {
      await app.start();
      await app.client.waitUntilWindowLoaded();
    },
    stop: async () => {
      try {
        if (app && app.isRunning()) {
          await app.stop();
        }
      } catch (e) {
        // Not much we can do about this
      }

      cleanupUserData();
    }
  };
}

function getTempDir(): Promise<[string, () => void]> {
  return new Promise((resolve, reject) => {
    const userDataDir = tmpdir((err, dir, cleanup) => {
      if (err) {
        reject(err);
      }

      resolve([dir, cleanup]);
    });
  });
}
