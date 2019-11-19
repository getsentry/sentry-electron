import { ChildProcess } from 'child_process';

/** Handle for a running process. */
export class ProcessStatus {
  public constructor(private readonly chProcess: ChildProcess) {}

  /** Kills the process if it is still running. */
  public async kill(): Promise<void> {
    if (await this.isRunning()) {
      this.chProcess.kill();
    }
  }

  /** Determines whether this process is still running. */
  public async isRunning(): Promise<boolean> {
    try {
      process.kill(this.chProcess.pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }
}
