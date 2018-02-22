import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

import { remote, app } from 'electron';
const BASE_PATH = join((app || remote.app).getPath('userData'), 'sentry');

export default class Store<T> {
  private data: T;
  private path: string;
  private flushing: boolean = false;

  constructor(filename: string, private initial: T) {
    if (!existsSync(BASE_PATH)) {
      mkdirSync(BASE_PATH);
    }

    this.path = join(BASE_PATH, filename);
  }

  private flush() {
    writeFileSync(this.path, JSON.stringify(this.data));
    this.flushing = false;
  }

  public set(next: T) {
    this.data = next;

    if (!this.flushing) {
      this.flushing = true;
      setImmediate(() => this.flush());
    }
  }

  public update(fn: (current: T) => T) {
    this.set(fn(this.get()));
  }

  public get(): T {
    if (this.data === undefined) {
      if (existsSync(this.path)) {
        this.data = JSON.parse(readFileSync(this.path, 'utf8'));
      } else {
        this.data = this.initial;
      }
    }

    return this.data;
  }
}
