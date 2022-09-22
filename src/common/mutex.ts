// This code was originally copied from  https://github.com/DirtyHairy/async-mutex
// before being significantly simplified for our usage
//
// Copied at commit: 3d2d987e60799d0fa222f1df8f99fc90ed570bfd
// Original licence:

// The MIT License (MIT)
//
// Copyright (c) 2016 Christian Speckner <cnspeckn@googlemail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

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
