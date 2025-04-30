import { ChildProcess, spawn, spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { delay } from '../helpers';
import { TestServer } from './server';
import { createLogger } from './utils';

function getDeleteDirectories(appName: string): string[] {
  switch (process.platform) {
    case 'win32':
      return [
        join(process.env.APPDATA || '', appName),
        join(process.env.LOCALAPPDATA || '', 'Temp', `${appName} Crashes`),
      ];
    case 'darwin':
      return [join(homedir(), 'Library', 'Application Support', appName)];
    case 'linux':
      return [join(homedir(), '.config', appName)];
  }

  throw new Error('Unknown platform');
}

const log = createLogger('Test Context');
const appLog = createLogger('App');

if (!process.env.DEBUG && !process.env.GITHUB_ACTIONS) {
  // tslint:disable-next-line
  console.log('You can enable DEBUG=true to get verbose output from the tests.');
}

/** A class to start and stop Electron apps for E2E tests. */
export class TestContext {
  /** Can check if the main process is running and kill it */
  public mainProcess?: ProcessStatus;

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
    private readonly _electronVersion: string,
    private readonly _appPath: string,
    private readonly _appName: string,
  ) {}

  /** Starts the app. */
  public async start(options: { secondRun?: boolean } = {}): Promise<void> {
    log('Starting test app');

    const env: Record<string, any | undefined> = {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: true,
      ELECTRON_DISABLE_SECURITY_WARNINGS: true,
    };

    if (!options.secondRun) {
      env.APP_FIRST_RUN = true;
      this._clearAppUserData();
    }

    const args = [this._appPath];
    // Electron no longer work correctly on Github Actions 'ubuntu-latest' with sandbox
    if (process.platform === 'linux') {
      args.push('--no-sandbox');
    }

    const childProcess = spawn(this._electronPath, args, { env });

    function logLinesWithoutEmpty(input: string): void {
      input
        // Replace all the lines from the renderer
        .replace(/^\[\d+:\d+\S+] "([\s\S]+?)"(?:[\s\S]+?)$/gm, (_, msg) => {
          return `[Renderer] ${msg
            .split(/[\r\n]+/)
            .filter((e: string) => e.match(/\S/))
            .join('\r\n[Renderer] ')}`;
        })
        .split(/[\r\n]+/)
        // ignore empty lines
        .filter((e: string) => e.match(/\S/))
        // Add [Main] to all non renderer lines
        .map((e: string) => (e.startsWith('[Renderer]') ? e : `[    Main] ${e}`))
        .forEach((e: string) => appLog(e));
    }

    childProcess.stdout.on('data', (data) => logLinesWithoutEmpty(data.toString()));
    childProcess.stderr.on('data', (data) => logLinesWithoutEmpty(data.toString()));

    this.mainProcess = new ProcessStatus(childProcess);

    await this.waitForTrue(
      async () => (this.mainProcess ? this.mainProcess.isRunning() : false),
      () => 'Timeout: Waiting for app to start',
    );

    log('App process has started');

    this._started = true;
  }

  /** Stops the app and cleans up. */
  public async stop(options: { retainData?: boolean } = {}): Promise<void> {
    log('Stopping test app');

    if (!this.mainProcess || !this.isStarted) {
      throw new Error('Invariant violation: Call start() first');
    }

    await this.mainProcess.kill();

    if (!options.retainData) {
      this._clearAppUserData();
    }

    log('Test app stopped');
  }

  /**
   * Promise only returns when the supplied method returns 'true'.
   *
   * @param method Method to poll.
   * @param timeout Time in ms to throw timeout.
   */
  public async waitForTrue(
    method: () => boolean | Promise<boolean>,
    message: () => string = () => 'Timeout',
    timeout: number = 12_000,
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
        const msg = message();
        log(msg);
        throw new Error(msg);
      }
    }
  }

  /**
   * Promise only returns when the test server has at least the
   * requested number of events
   *
   * @param count Number of events to wait for
   */
  public async waitForEvents(testServer: TestServer, count: number, timeout: number = 15_000): Promise<void> {
    log(`Waiting for ${count} events`);
    await this.waitForTrue(
      () => testServer.events.length >= count,
      () => `Timeout: Waiting ${timeout}ms for ${count} events. Only ${testServer.events.length} events received`,
      timeout,
    );
    log(`${count} events received`);
  }

  /** Waits for app to close */
  public async waitForAppClose(): Promise<void> {
    await this.waitForTrue(
      async () => (this.mainProcess ? !(await this.mainProcess.isRunning()) : false),
      () => 'Timeout: Waiting for app to die',
    );

    // Ensure everything has closed
    await delay(1_000);
  }

  public get isStarted(): boolean {
    return this._started;
  }

  private _clearAppUserData() {
    for (const dir of getDeleteDirectories(this._appName)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (_) {
        //
      }
    }
  }
}

/** Handle for a running process. */
export class ProcessStatus {
  public constructor(private readonly _chProcess: ChildProcess) {}

  /** Kills the process if it is still running. */
  public async kill(): Promise<void> {
    const pid = this._chProcess.pid;

    if (await this.isRunning()) {
      this._chProcess.kill();
    }

    // The tests sometimes hang in CI because the Electron processes don't exit
    if (process.platform === 'win32') {
      spawnSync('taskkill /F /IM electron.exe', { shell: true });
    } else if (process.platform === 'darwin') {
      spawnSync(`kill -9 ${pid}`, { shell: true });
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
