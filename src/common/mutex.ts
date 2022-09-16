// This code was originally copied from  https://github.com/DirtyHairy/async-mutex
// before being significantly simplified for our usage

type Releaser = () => void;

interface QueueEntry {
  resolve(result: Releaser): void;
  reject(error: unknown): void;
}

/** An async mutex that queues up tasks for a shared resource */
export class Mutex {
  private _entries: Array<QueueEntry> = [];
  private _waiters: Array<Releaser> = [];
  private _value: number = 1;

  /** Run a task when all pending tasks are complete */
  public async runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    const release = await this._acquire();

    try {
      return await task();
    } finally {
      release();
    }
  }

  /** Gets a promise that resolves when all pending tasks are complete */
  private _acquire(): Promise<Releaser> {
    return new Promise((resolve, reject) => {
      this._entries.push({ resolve, reject });

      this._dispatch();
    });
  }

  /** Releases after a task is complete */
  private _release(): void {
    this._value += 1;
    this._dispatch();
  }

  /** Dispatches pending tasks */
  private _dispatch(): void {
    for (let weight = this._value; weight > 0; weight--) {
      const queueEntry = this._entries?.shift();
      if (!queueEntry) continue;

      this._value -= weight;
      weight = this._value + 1;

      queueEntry.resolve(this._newReleaser());
    }

    this._drainUnlockWaiters();
  }

  /** Creates a new releaser */
  private _newReleaser(): Releaser {
    let called = false;

    return () => {
      if (called) return;
      called = true;

      this._release();
    };
  }

  /** Drain unlock waiters */
  private _drainUnlockWaiters(): void {
    for (let weight = this._value; weight > 0; weight--) {
      if (!this._waiters[weight - 1]) continue;

      this._waiters.forEach((waiter) => waiter());
      this._waiters = [];
    }
  }
}
