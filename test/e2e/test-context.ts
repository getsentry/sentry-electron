import { join } from 'path';
import * as pTree from 'process-tree';
import { Application } from 'spectron';
import * as tmpdir from 'temporary-directory';
import { promisify } from 'util';
import { ProcessStatus } from './process-status';
import { TestServer } from './test-server';

const processTree = promisify(pTree);

export class TestContext {
  /** The Spectron Application class */
  public app: Application;
  /** Can check if the main process is running and kill it */
  public mainProcess: ProcessStatus;

  // This gets the path to the Electron executable on any platform
  private electronPath: string = require('electron') as any;
  private tempDir: TempDirectory;

  /**
   * Creates an instance of TestContext.
   *
   * @param {string} [appPath=join(__dirname, '../../example')] Path to the application to run
   * @param {any} [testServer=new TestServer()] A test server instance. Setting to 'undefined' will disable test server.
   * @memberof TestContext
   */
  constructor(
    private appPath = join(__dirname, '../../example'),
    public testServer = new TestServer()
  ) { }

  /** Starts the app */
  public async start(): Promise<void> {
    // Start the test server if required
    if (this.testServer) {
      this.testServer.start();
    }

    // Get a temp directory for this app to use as userData
    this.tempDir = await this.getTempDir();

    this.app = new Application({
      path: this.electronPath,
      args: [this.appPath],
      env: {
        E2E_APPDATA_DIRECTORY: this.tempDir.path,
      },
    });

    await this.app.start();
    await this.app.client.waitUntilWindowLoaded();

    // Save the main process pid so we can terminate the crashed app later
    // We have to do this as we lose connection via Chromedriver
    this.mainProcess = new ProcessStatus(await (this.app.mainProcess as any).pid());
  }

  /** Stops the app and cleans up  */
  public async stop(): Promise<void> {
    try {
      if (this.app && this.app.isRunning()) {
        await this.app.stop();
      }
    } catch (e) {
      // When the app crashes we can lose the session
    }

    if (this.tempDir) {
      this.tempDir.cleanup();
    }

    if (this.testServer) {
      await this.testServer.stop();
    }

    await this.mainProcess.kill();
    await this.tryKillChromeDriver();
  }

  /**
   * Promise only returns when the supplied method returns 'true'
   *
   * @param {() => boolean} method Method to poll
   * @param {number} [timeout=5000] Time in ms to throw timeout
   * @returns {Promise<void>}
   */
  public async waitForTrue(method: () => boolean, timeout: number = 5000): Promise<void> {
    while (method() === false) {
      await this.app.client.pause(100);
      timeout -= 100;
      if (timeout < 0) {
        throw new Error('Timed out');
      }
    }
  }

  /**
   * When the renderer crashes, Chromedriver does not close and does not respond.
   * We have to find the process and kill it.
   *
   * @param {number} [pid=process.pid]
   */
  private async tryKillChromeDriver(pid: number = process.pid) {
    for (const each of await processTree(pid)) {
      if ((each.name as string).toLowerCase().includes('chromedriver')) {
        process.kill(each.pid);
      } else {
        this.tryKillChromeDriver(each.pid);
      }
    }
  }

  private getTempDir(): Promise<TempDirectory> {
    return new Promise((resolve, reject) => {
      const userDataDir = tmpdir((err, dir, cleanup) => {
        if (err) {
          reject(err);
        }

        resolve({
          path: dir,
          cleanup
        });
      });
    });
  }
}

interface TempDirectory {
  path: string;
  cleanup: () => void;
}


