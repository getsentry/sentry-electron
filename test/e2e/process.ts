import { ChildProcess, spawnSync } from 'child_process';

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
      process.kill(this._chProcess.pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }
}
