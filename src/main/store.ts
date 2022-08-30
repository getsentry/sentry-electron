import { logger } from '@sentry/utils';
import { dirname, join } from 'path';

import { mkdirpSync, readFileAsync, statAsync, unlinkAsync, writeFileAsync } from './fs';

const dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.*\d{0,10}Z$/;

/** JSON revive function to enable de-serialization of Date objects */
function dateReviver(_: string, value: any): any {
  if (typeof value === 'string' && dateFormat.test(value)) {
    return new Date(value);
  }

  return value;
}

/**
 * Note, this class is only compatible with Node.
 * Lazily serializes data to a JSON file to persist. When created, it loads data
 * from that file if it already exists.
 */
export class Store<T> {
  /** Internal path for JSON file. */
  private readonly _path: string;
  /** Value used to initialize data for the first time. */
  private readonly _initial: T;
  /** Current state of the data. */
  private _data?: T;
  /** State whether a flush to disk has been requested in this cycle. */
  private _flushing: boolean;

  /**
   * Creates a new store.
   *
   * @param path A unique filename to store this data.
   * @param id A unique filename to store this data.
   * @param initial An initial value to initialize data with.
   */
  public constructor(path: string, id: string, initial: T) {
    this._path = join(path, `${id}.json`);
    this._initial = initial;
    this._flushing = false;
  }

  /**
   * Updates data by replacing it with the given value.
   * @param next New data to replace the previous one.
   * @param forceFlush Forces the write to be flushed to disk immediately
   */
  public async set(next: T, forceFlush: boolean = false): Promise<void> {
    this._data = next;

    if (!this._flushing) {
      this._flushing = true;
      if (forceFlush) {
        await this._flush();
      } else {
        setImmediate(() => {
          void this._flush();
        });
      }
    }
  }

  /**
   * Updates data by passing it through the given function.
   * @param fn A function receiving the current data and returning new one.
   */
  public async update(fn: (current: T) => T): Promise<void> {
    await this.set(fn(await this.get()));
  }

  /**
   * Returns the current data.
   *
   * When invoked for the first time, it will try to load previously stored data
   * from disk. If the file does not exist, the initial value provided to the
   * constructor is used.
   */
  public async get(): Promise<T> {
    if (this._data === undefined) {
      try {
        this._data = JSON.parse(await readFileAsync(this._path, 'utf8'), dateReviver) as T;
      } catch (e) {
        this._data = this._initial;
      }
    }

    return this._data;
  }

  /** Returns store to its initial state */
  public async clear(): Promise<void> {
    await this.set(this._initial);
  }

  /** Gets the Date that the file was last modified */
  public async getModifiedDate(): Promise<Date | undefined> {
    try {
      return (await statAsync(this._path))?.mtime;
    } catch (_) {
      return undefined;
    }
  }

  /** Serializes the current data into the JSON file. */
  private async _flush(): Promise<void> {
    try {
      if (this._data === undefined) {
        try {
          await unlinkAsync(this._path);
        } catch (_) {
          //
        }
      } else {
        mkdirpSync(dirname(this._path));
        await writeFileAsync(this._path, JSON.stringify(this._data));
      }
    } catch (e) {
      logger.warn('Failed to flush store', e);
      // This usually fails due to anti virus scanners, issues in the file
      // system, or problems with network drives. We cannot fix or handle this
      // issue and must resume gracefully. Thus, we have to ignore this error.
    } finally {
      this._flushing = false;
    }
  }
}
