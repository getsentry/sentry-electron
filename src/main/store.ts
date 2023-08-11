import { logger } from '@sentry/utils';
import { dirname, join } from 'path';

import { Mutex } from '../common/mutex';
import { mkdirp, readFileAsync, statAsync, unlinkAsync, writeFileAsync } from './fs';

const dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.*\d{0,10}Z$/;

/** JSON revive function to enable de-serialization of Date objects */
function dateReviver(_: string, value: any): any {
  if (typeof value === 'string' && dateFormat.test(value)) {
    return new Date(value);
  }

  return value;
}

/**
 * Stores data serialized to a JSON file.
 */
export class Store<T> {
  /** Current state of the data. */
  protected _data?: T;

  /** Internal path for JSON file. */
  private readonly _path: string;
  /** Value used to initialize data for the first time. */
  private readonly _initial: T;
  /** A mutex to ensure that there aren't races while reading and writing files */
  private readonly _lock: Mutex;

  /**
   * Creates a new store.
   *
   * @param path A unique filename to store this data.
   * @param id A unique filename to store this data.
   * @param initial An initial value to initialize data with.
   */
  public constructor(path: string, id: string, initial: T) {
    this._lock = new Mutex();
    this._path = join(path, `${id}.json`);
    this._initial = initial;
  }

  /**
   * Updates data by replacing it with the given value.
   * @param data New data to replace the previous one.
   */
  public async set(data: T): Promise<void> {
    await this._lock.runExclusive(async () => {
      this._data = data;

      try {
        if (data === undefined) {
          try {
            await unlinkAsync(this._path);
          } catch (_) {
            //
          }
        } else {
          await mkdirp(dirname(this._path));
          await writeFileAsync(this._path, JSON.stringify(data));
        }
      } catch (e) {
        logger.warn('Failed to write to store', e);
        // This usually fails due to anti virus scanners, issues in the file
        // system, or problems with network drives. We cannot fix or handle this
        // issue and must resume gracefully. Thus, we have to ignore this error.
      }
    });
  }

  /**
   * Returns the current data.
   *
   * When invoked for the first time, it will try to load previously stored data
   * from disk. If the file does not exist, the initial value provided to the
   * constructor is used.
   */
  public async get(): Promise<T> {
    return this._lock.runExclusive(async () => {
      if (this._data === undefined) {
        try {
          this._data = JSON.parse(await readFileAsync(this._path, 'utf8'), dateReviver) as T;
        } catch (e) {
          this._data = this._initial;
        }
      }

      return this._data;
    });
  }

  /**
   * Updates data by passing it through the given function.
   * @param fn A function receiving the current data and returning new one.
   */
  public async update(fn: (current: T) => T): Promise<void> {
    await this.set(fn(await this.get()));
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
}

/**
 * Extends Store to throttle writes.
 */
export class BufferedWriteStore<T> extends Store<T> {
  /** A write that hasn't been written to disk yet */
  private _pendingWrite: { data: T; timeout: NodeJS.Timeout } | undefined;

  /**
   * Creates a new ThrottledStore.
   *
   * @param path A unique filename to store this data.
   * @param id A unique filename to store this data.
   * @param initial An initial value to initialize data with.
   * @param throttleTime The minimum time between writes
   */
  public constructor(path: string, id: string, initial: T, private readonly _throttleTime: number = 500) {
    super(path, id, initial);
  }

  /** @inheritdoc */
  public override async set(data: T): Promise<void> {
    this._data = data;

    this._pendingWrite = {
      // We overwrite the data for the pending write so that the latest data is written in the next flush
      data,
      // If there is already a pending timeout, we keep that rather than starting the timeout again
      timeout: this._pendingWrite?.timeout || setTimeout(() => this._writePending(), this._throttleTime),
    };
  }

  /** Writes the pending write to disk */
  private _writePending(): void {
    if (this._pendingWrite) {
      const data = this._pendingWrite.data;
      // Clear the pending write immediately so that subsequent writes can be queued
      this._pendingWrite = undefined;
      void super.set(data);
    }
  }
}
