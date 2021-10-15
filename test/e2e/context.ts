import { ChildProcess, spawn, spawnSync } from 'child_process';
import { join } from 'path';
import { dir as tempDirectory, DirectoryResult } from 'tmp-promise';

import { TestServer } from './server';
import { createLogger } from './utils';

const log = createLogger('Test Context');

if (!process.env.DEBUG) {
  // tslint:disable-next-line
  console.log('You can enable DEBUG=true to get verbose output.');
}

/** A class to start and stop Electron apps for E2E tests. */
export class TestContext {
  /** Can check if the main process is running and kill it */
  public mainProcess?: ProcessStatus;

  /** App stdout used for writing to console on failed tests */
  public processStdOut: string = '';

  /** Temporary directory that hosts the app's User Data. */
  private _tempDir?: DirectoryResult;

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
    private readonly _appPath: string = join(__dirname, 'test-apps', 'node-integration'),
  ) {}

  /** Starts the app. */
  public async start(options: { secondRun?: boolean } = {}): Promise<void> {
    log('Starting test context');
    // Only setup the tempDir if this the first start of the context
    // Subsequent starts will use the same path
    if (!this._tempDir) {
      // Get a temp directory for this app to use as userData
      this._tempDir = await tempDirectory();
    }

    const env: Record<string, any | undefined> = {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: process.env.DEBUG,
    };

    if (!options.secondRun) {
      env.APP_FIRST_RUN = true;
    }

    const childProcess = spawn(this._electronPath, [this._appPath], { env });

    // eslint-disable-next-line no-extra-boolean-cast
    if (!!process.env.DEBUG) {
      childProcess.stdout.pipe(process.stdout);
      childProcess.stderr.on('data', (data) => {
        const str = data.toString();
        if (str.match(/^\[\d+:\d+/)) {
          return;
        }
        process.stderr.write(data);
      });
    } else {
      childProcess.stdout.on('data', (data) => {
        this.processStdOut += data.toString();
      });
      childProcess.stderr.on('data', (data) => {
        this.processStdOut += data.toString();
      });
    }

    this.mainProcess = new ProcessStatus(childProcess);

    await this.waitForTrue(
      async () => (this.mainProcess ? this.mainProcess.isRunning() : false),
      'Timeout: Waiting for app to start',
    );

    log('App process has started');

    this._started = true;
  }

  /** Stops the app and cleans up. */
  public async stop(options: { retainData?: boolean; logStdout?: boolean } = {}): Promise<void> {
    log('Stopping test context');

    if (options.logStdout) {
      this._logStdout();
    }

    if (!this.mainProcess || !this.isStarted) {
      throw new Error('Invariant violation: Call start() first');
    }

    await this.mainProcess.kill();

    if (this._tempDir && !options.retainData) {
      await this._tempDir.cleanup();
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
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      remaining -= 100;
      if (remaining < 0) {
        log(message);
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
    log(`Waiting for ${count} events`);
    await this.waitForTrue(
      () => testServer.events.length >= count,
      `Timeout: Waiting for ${count} events. Only ${testServer.events.length} events received`,
      timeout,
    );
    log(`${count} events received`);
  }

  /** Waits for app to close */
  public async waitForAppClose(): Promise<void> {
    await this.waitForTrue(
      async () => (this.mainProcess ? !(await this.mainProcess.isRunning()) : false),
      'Timeout: Waiting for app to die',
    );
  }

  public get isStarted(): boolean {
    return this._started;
  }

  /** Logs stdout for debug testing */
  private _logStdout(): void {
    log('App stdout: ', this.processStdOut);
  }
}

/** Handle for a running process. */
export class ProcessStatus {
  public constructor(private readonly _chProcess: ChildProcess) {}

  /** Kills the process if it is still running. */
  public async kill(): Promise<void> {
    if (await this.isRunning()) {
      this._chProcess.kill();
    }

    if (process.platform == 'win32') {
      // The tests sometimes hang in CI on Windows because the Electron processes don't exit
      spawnSync('taskkill /F /IM electron.exe', { shell: true });
    }
  }

  /** Determines whether this process is still running. */
  public async isRunning(): Promise<boolean> {
    try {
      if (this._chProcess.pid) {
        process.kill(this._chProcess.pid, 0);
        return true;
      }
    } catch (e) {
      //
    }

    return false;
  }
}
