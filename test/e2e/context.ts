import { join } from 'path';

import pTree = require('process-tree');
import { Application } from 'spectron';
import tmpdir = require('temporary-directory');
import { promisify } from 'util';
import { ProcessStatus } from './process';
import { TestServer } from './server';

const processTree = promisify(pTree);

/** A temporary directory handle. */
interface TempDirectory {
  /** Absolute path to the directory. */
  path: string;
  /** A function that will remove the directory when invoked. */
  cleanup(): void;
}

/**
 * Kills all chrome driver processes (i.e. sub-processes) of an Electron app.
 * @param pid The PID of the root process
 */
async function tryKillChromeDriver(pid: number = process.pid): Promise<void> {
  for (const each of await processTree(pid)) {
    if (each.name.toLowerCase().includes('chromedriver')) {
      process.kill(each.pid);
    } else {
      await tryKillChromeDriver(each.pid);
    }
  }
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

/** A class to start and stop Electron apps for E2E tests. */
export class TestContext {
  /** The Spectron Application class */
  public app?: Application;
  /** Can check if the main process is running and kill it */
  public mainProcess?: ProcessStatus;
  /** Temporary directory that hosts the app's User Data. */
  private tempDir?: TempDirectory;
  /** Platform-independent path to the electron executable. */
  private readonly electronPath: string = require('electron') as any;

  /**
   * Creates an instance of TestContext.
   * Pass `undefined` to `testServer` to disable the test server.
   *
   * @param appPath Path to the application to run
   * @param testServer A test server instance.
   */
  public constructor(
    private readonly appPath: string = join(__dirname, '../../example'),
    public testServer: TestServer = new TestServer(),
  ) {}

  /** Starts the app. */
  public async start(): Promise<void> {
    // Start the test server if required
    if (this.testServer) {
      this.testServer.start();
    }

    // Only setup the tempDir if this the first start of the context
    // Subseqent starts will se the same path
    if (!this.tempDir) {
      // Get a temp directory for this app to use as userData
      this.tempDir = await getTempDir();
    }

    this.app = new Application({
      args: [this.appPath],
      env: {
        DSN:
          'http://37f8a2ee37c0409d8970bc7559c7c7e4:4cfde0ca506c4ea39b4e25b61a1ff1c3@localhost:8000/277345',
        E2E_USERDATA_DIRECTORY: this.tempDir.path,
      },
      path: this.electronPath,
    });

    await this.app.start();
    await this.app.client.waitUntilWindowLoaded();

    // Save the main process pid so we can terminate the crashed app later
    // We have to do this as we lose connection via Chromedriver
    const getPid = (this.app.mainProcess as any).pid as () => Promise<number>;
    this.mainProcess = new ProcessStatus(await getPid());
  }

  /** Stops the app and cleans up. */
  public async stop(clearData: boolean = true): Promise<void> {
    if (!this.mainProcess) {
      throw new Error('Invariant violation: Call .start() first');
    }

    try {
      if (this.app && this.app.isRunning()) {
        await this.app.stop();
      }
    } catch (e) {
      // When the app crashes we can lose the session
    }

    if (this.tempDir && clearData) {
      this.tempDir.cleanup();
    }

    if (this.testServer) {
      await this.testServer.stop();
    }

    await this.mainProcess.kill();

    // When the renderer crashes, Chromedriver does not close and does not
    // respond. We have to find the process and kill it.
    await tryKillChromeDriver();
  }

  /**
   * Waits until a button appears and then clicks it.
   * @param selector CSS selector of the target button.
   */
  public async clickButton(selector: string): Promise<void> {
    if (!this.app) {
      throw new Error('Invariant violation: Call .start() first');
    }

    try {
      await this.app.client.waitForExist(selector).click(selector);
    } catch (e) {
      // If the renderer crashes it can cause an exception in 'click'
    }
  }

  /**
   * Promise only returns when the supplied method returns 'true'.
   *
   * @param method Method to poll.
   * @param timeout Time in ms to throw timeout.
   * @returns
   */
  public async waitForTrue(
    method: () => boolean,
    timeout: number = 5000,
  ): Promise<void> {
    if (!this.app) {
      throw new Error('Invariant violation: Call .start() first');
    }

    let remaining = timeout;
    while (!method()) {
      await this.app.client.pause(100);
      remaining -= 100;
      if (remaining < 0) {
        throw new Error('Timed out');
      }
    }
  }
}
