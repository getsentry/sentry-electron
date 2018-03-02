export class ProcessStatus {
  constructor(private pid: number) {}

  public async kill(): Promise<void> {
    if (await this.isRunning()) {
      process.kill(this.pid);
    }
  }

  public async isRunning(): Promise<boolean> {
    try {
      process.kill(this.pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }
}
