/** Handle for a running process. */
export class ProcessStatus {
  public constructor(private readonly pid: number) {}

  /** Kills the process if it is still running. */
  public async kill(): Promise<void> {
    if (await this.isRunning()) {
      process.kill(this.pid);
    }
  }

  /** Determines whether this process is still running. */
  public async isRunning(): Promise<boolean> {
    try {
      process.kill(this.pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }
}
