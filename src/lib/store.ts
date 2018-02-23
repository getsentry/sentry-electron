import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { app, remote } from 'electron';

/** App-specific directory to store information in. */
const USER_DATA_PATH = (app || remote.app).getPath('userData');
const BASE_PATH = join(USER_DATA_PATH, 'sentry');

/**
 * Lazily serializes data to a JSON file to persist it beyond application
 * crashes. When created, it loads data from that file if it already exists.
 */
export default class Store<T> {
  /** Current state of the data. */
  private data: T;
  /** Internal path for JSON file. */
  private _path?: string;
  /** State whether a flush to disk has been requested in this cycle. */
  private flushing: boolean = false;

  /**
   * Creates a new store.
   *
   * @param filename A unique filename to store this data.
   * @param initial An initial value to initialize data with.
   */
  constructor(public filename: string, private initial?: T) {}

  /**
   * Return the path to the JSON file storing the information.
   */
  private get path(): string {
    if (this._path) {
      return this._path;
    }
    if (!existsSync(USER_DATA_PATH)) {
      mkdirSync(USER_DATA_PATH);
    }
    if (!existsSync(BASE_PATH)) {
      mkdirSync(BASE_PATH);
    }
    this._path = join(BASE_PATH, this.filename);
    return this._path;
  }

  /**
   * Updates data by replacing it with the given value.
   * @param next New data to replace the previous one.
   */
  public set(next: T) {
    this.data = next;

    if (!this.flushing) {
      this.flushing = true;
      setImmediate(() => this.flush());
    }
  }

  /**
   * Updates data by passing it through the given function.
   * @param fn A function receiving the current data and returning new one.
   */
  public update(fn: (current: T) => T) {
    this.set(fn(this.get()));
  }

  /**
   * Returns the current data.
   *
   * When invoked for the first time, it will try to load previously stored data
   * from disk. If the file does not exist, the initial value provided to the
   * constructor is used.
   */
  public get(): T {
    if (this.data === undefined) {
      this.data = existsSync(this.path)
        ? JSON.parse(readFileSync(this.path, 'utf8'))
        : this.initial;
    }

    return this.data;
  }

  /** Serializes the current data into the JSON file. */
  private flush() {
    writeFileSync(this.path, JSON.stringify(this.data));
    this.flushing = false;
  }
}
