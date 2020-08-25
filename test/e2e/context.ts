import { spawn } from 'child_process';
import { join } from 'path';
import tmpdir = require('temporary-directory');

import { ProcessStatus } from './process';
import { TestServer } from './server';

/**
 * Counter used to create unique app name so each test uses a unique
 *  'AppName Crashes' directory for native crashes.
 */
let appInstanceCount = 0;

/** A temporary directory handle. */
interface TempDirectory {
  /** Absolute path to the directory. */
  path: string;
  /** A function that will remove the directory when invoked. */
  cleanup(): void;
}

/** Creates a temporary directory with a cleanup function. */
async function getTempDir(): Promise<TempDirectory> {
  return new Promise<TempDirectory>((resolve, reject) => {
    tmpdir((err, dir, cleanup) => {
      if (err) {
        reject(err);
      } else {
        resolve({ cleanup, path: dir });
      }
    });
  });
}

if (!process.env.DEBUG) {
  console.log('You can enable DEBUG=true to get verbose output.');
}

/** A class to start and stop Electron apps for E2E tests. */
export class TestContext {
  /** Can check if the main process is running and kill it */
  public mainProcess?: ProcessStatus;

  /** Unique app name. */
  // eslint-disable-next-line no-plusplus
  private readonly _appName: string = `test-app-${++appInstanceCount}`;

  /** Temporary directory that hosts the app's User Data. */
  private _tempDir?: TempDirectory;

  private _started: boolean = false;

  /**
   * Creates an instance of TestContext.
   * Pass `undefined` to `testServer` to disable the test server.
   *
   * @param appPath Path to the application to run
   * @param testServer A test server instance.
   */
  public constructor(
    private readonly _electronPath: string,
    private readonly _appPath: string = join(__dirname, 'test-app'),
  ) {}

  /** Starts the app. */
  public async start(sentryConfig?: string, fixture?: string): Promise<void> {
    // Only setup the tempDir if this the first start of the context
    // Subsequent starts will use the same path
    if (!this._tempDir) {
      // Get a temp directory for this app to use as userData
      this._tempDir = await getTempDir();
    }

    const env: { [key: string]: string | undefined } = {
      ...process.env,
      DSN: 'http://37f8a2ee37c0409d8970bc7559c7c7e4@localhost:8123/277345',
      E2E_APP_NAME: this._appName,
      E2E_TEST_SENTRY: sentryConfig,
      E2E_USERDATA_DIRECTORY: this._tempDir.path,
      ELECTRON_ENABLE_LOGGING: process.env.DEBUG,
    };

    if (fixture) {
      env.E2E_TEST_FIXTURE = fixture;
    }

    const childProcess = spawn(this._electronPath, [this._appPath], { env });

    // eslint-disable-next-line no-extra-boolean-cast
    if (!!process.env.DEBUG) {
      childProcess.stdout.pipe(process.stdout);
      childProcess.stderr.on('data', data => {
        const str = data.toString();
        if (str.match(/^\[\d+:\d+/)) {
          return;
        }
        process.stderr.write(data);
      });
    }

    this.mainProcess = new ProcessStatus(childProcess);

    await this.waitForTrue(
      async () => (this.mainProcess ? this.mainProcess.isRunning() : false),
      'Timeout: Waiting for app to start',
    );

    this._started = true;
  }

  /** Stops the app and cleans up. */
  public async stop(clearData: boolean = true): Promise<void> {
    if (!this.mainProcess) {
      throw new Error('Invariant violation: Call .start() first');
    }

    await this.mainProcess.kill();

    if (this._tempDir && clearData) {
      this._tempDir.cleanup();
    }
  }

  /**
   * Promise only returns when the supplied method returns 'true'.
   *
   * @param method Method to poll.
   * @param timeout Time in ms to throw timeout.
   */
  public async waitForTrue(
    method: () => boolean | Promise<boolean>,
    message: string = 'Timeout',
    timeout: number = 8000,
  ): Promise<void> {
    if (!this.mainProcess) {
      throw new Error('Invariant violation: Call .start() first');
    }

    const isPromise = method() instanceof Promise;

    let remaining = timeout;
    while (isPromise ? !(await method()) : !method()) {
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      remaining -= 100;
      if (remaining < 0) {
        throw new Error(message);
      }
    }
  }

  /**
   * Promise only returns when the test server has at least the
   * requested number of events
   *
   * @param count Number of events to wait for
   */
  public async waitForEvents(testServer: TestServer, count: number, timeout: number = 15000): Promise<void> {
    await this.waitForTrue(() => testServer.events.length >= count, 'Timeout: Waiting for events', timeout);
  }

  public isStarted(): boolean {
    return this._started;
  }
}
