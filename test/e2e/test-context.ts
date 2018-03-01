import { join } from 'path';
import * as pTree from 'process-tree';
import { Application } from 'spectron';
import * as tmpdir from 'temporary-directory';
import { promisify } from 'util';
import { TestServer } from './test-server';

const processTree = promisify(pTree);

export class TestContext {
  public app: Application;

  private electronPath: string = require('electron') as any;
  private tempDir: { path: string, cleanup: () => void };
  private mainProcessPid: number;

  constructor(
    public testServer = new TestServer(),
    private appPath = join(__dirname, '../../example')
  ) { }

  public async start(): Promise<void> {
    if (this.testServer) {
      this.testServer.start();
    }

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

    this.mainProcessPid = await (this.app.mainProcess as any).pid();
  }

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

    try {
      process.kill(this.mainProcessPid);
      await this.tryKillChromeDriver(process.pid);
    } catch (e) {
      // something
    }
  }

  public async waitForTrue(method: () => boolean, timeout: number = 5000): Promise<void> {
    while (method() === false) {
      await this.app.client.pause(1000);
      timeout -= 1000;
      if (timeout <= 0) {
        throw new Error('Timed out');
      }
    }
  }

  private async tryKillChromeDriver(pid: number) {
    for (const each of await processTree(pid)) {
      if ((each.name as string).toLowerCase().includes('chromedriver')) {
        process.kill(each.pid);
      } else {
        this.tryKillChromeDriver(each.pid);
      }
    }
  }

  private getTempDir(): Promise<{ path: string, cleanup: () => void }> {
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
