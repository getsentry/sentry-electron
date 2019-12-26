import { Event } from '@sentry/types';
import { Dsn, logger } from '@sentry/utils';
import FormData = require('form-data');
import * as fs from 'fs';
import fetch from 'node-fetch';
import { basename, join } from 'path';
import { promisify } from 'util';

import { mkdirp } from './fs';
import { Store } from './store';

const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

/** Status code returned by Sentry to retry event submission later. */
const CODE_RETRY = 429;

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE = 30;

/** Maximum number of requests that we store/queue if something goes wrong. */
const MAX_REQUESTS_COUNT = 10;

/** Supported types of Electron CrashReporters. */
type CrashReporterType = 'crashpad' | 'breakpad';

/**
 * Payload for a minidump request comprising a persistent file system path and
 * event metadata.
 */
export interface MinidumpRequest {
  /** Path to the minidump file. */
  path: string;
  /** Associated event data. */
  event: Event;
}

/**
 * A service that discovers Minidump crash reports and uploads them to Sentry.
 */
export class MinidumpUploader {
  /** The minidump ingestion endpoint URL. */
  private readonly _url: string;

  /** The type of the Electron CrashReporter used to search for Minidumps. */
  private readonly _type: CrashReporterType;

  /** The sub-directory where crashpad dumps can be found */
  private readonly _crashpadSubDirectory: string;

  /** List of minidumps that have been found already. */
  private readonly _knownPaths: string[];

  /** The directory Electron stores crashes in. */
  private readonly _crashesDirectory: string;

  /** A persistent directory to cache minidumps. */
  private readonly _cacheDirectory: string;

  /** Ensures we only call win-ca once */
  private _loadedWinCA: boolean = false;

  /**
   * Store to persist queued Minidumps beyond application crashes or lost
   * internet connection.
   */
  private readonly _queue: Store<MinidumpRequest[]>;

  /**
   * Creates a new uploader instance.
   *
   * @param dsn The Sentry DSN.
   * @param crashesDirectory The directory Electron stores crashes in.
   * @param cacheDirectory A persistent directory to cache minidumps.
   */
  public constructor(dsn: Dsn, crashesDirectory: string, cacheDirectory: string) {
    const crashpadWindows = process.platform === 'win32' && parseInt(process.versions.electron.split('.')[0], 10) >= 6;
    this._type = process.platform === 'darwin' || crashpadWindows ? 'crashpad' : 'breakpad';
    this._crashpadSubDirectory = process.platform === 'darwin' ? 'completed' : 'reports';
    this._knownPaths = [];

    this._url = MinidumpUploader.minidumpUrlFromDsn(dsn);
    this._crashesDirectory = crashesDirectory;
    this._cacheDirectory = cacheDirectory;
    this._queue = new Store(this._cacheDirectory, 'queue', []);
  }

  /**
   * Returns the minidump endpoint in Sentry
   * @param dsn Dsn
   */
  public static minidumpUrlFromDsn(dsn: Dsn): string {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
      path !== '' ? `/${path}` : ''
    }/api/${projectId}/minidump?sentry_key=${user}`;
  }

  /**
   * Uploads a minidump file to Sentry.
   *
   * @param path Absolute path to the minidump file.
   * @param event Event data to attach to the minidump.
   * @returns A promise that resolves when the upload is complete.
   */
  public async uploadMinidump(request: MinidumpRequest): Promise<void> {
    logger.log('Uploading minidump', request.path);

    try {
      if (!this._loadedWinCA) {
        this._loadedWinCA = true;
        // On Windows this fetches Root CAs from the Windows store (Trusted Root
        // Certification Authorities) and makes them available to Node.js.
        //
        // Without this, Node.js cannot upload minidumps on corporate networks
        // that perform deep SSL inspection by installing a custom root certificate
        // on every machine.
        const caPath = join(this._cacheDirectory, 'win-ca', 'pem');
        // tslint:disable-next-line: no-unsafe-any
        require('win-ca/api')({ fallback: true, save: caPath });
      }

      const body = new FormData();
      body.append('upload_file_minidump', fs.createReadStream(request.path));
      body.append('sentry', JSON.stringify(request.event));
      const response = await fetch(this._url, { method: 'POST', body });

      // Too many requests, so we queue the event and send it later
      if (response.status === CODE_RETRY) {
        await this._queueMinidump(request);
      }

      // We either succeeded or something went horribly wrong. Either way, we
      // can remove the minidump file.
      try {
        await unlink(request.path);
      } catch (e) {
        logger.warn('Could not delete', request.path);
      }

      // Forget this minidump in all caches
      // tslint:disable-next-line: strict-comparisons
      this._queue.update(queued => queued.filter(stored => stored !== request));
      this._knownPaths.splice(this._knownPaths.indexOf(request.path), 1);

      // If we were successful, we can try to flush the remaining queue
      if (response.ok) {
        await this.flushQueue();
      }
    } catch (err) {
      logger.warn('Failed to upload minidump', err);

      // User's internet connection was down so we queue it as well
      const error = err ? (err as { code: string }) : { code: '' };
      if (error.code === 'ENOTFOUND') {
        await this._queueMinidump(request);
      }
    }
  }

  /**
   * Helper to filter an array with asynchronous callbacks.
   *
   * @param array An array containing items to filter.
   * @param predicate An async predicate evaluated on every item.
   * @param thisArg Optional value passed as "this" into the callback.
   * @returns An array containing only values where the callback returned true.
   */
  private async _filterAsync<T>(
    array: T[],
    predicate: (item: T) => Promise<boolean> | boolean,
    thisArg?: any,
  ): Promise<T[]> {
    const verdicts = await Promise.all(array.map(predicate, thisArg));
    return array.filter((_, index) => verdicts[index]);
  }

  /**
   * Searches for new, unknown minidump files in the crash directory.
   * @returns A promise that resolves to absolute paths of those dumps.
   */
  public async getNewMinidumps(): Promise<string[]> {
    const minidumps = this._type === 'crashpad' ? await this._scanCrashpadFolder() : await this._scanBreakpadFolder();
    logger.log(`Found ${minidumps.length} minidumps`);

    const oldestMs = new Date().getTime() - MAX_AGE * 24 * 3600 * 1000;
    return this._filterAsync(minidumps, async path => {
      // Skip files that we have seen before
      if (this._knownPaths.indexOf(path) >= 0) {
        return false;
      }

      // Lock this minidump until we have uploaded it or an error occurs and we
      // remove it from the file system.
      this._knownPaths.push(path);

      // We do not want to upload minidumps that have been generated before a
      // certain threshold. Those old files can be deleted immediately.
      const stats = await stat(path);
      if (stats.birthtimeMs < oldestMs) {
        try {
          await unlink(path);
        } catch (e) {
          logger.warn('Could not delete', path);
        }
        this._knownPaths.splice(this._knownPaths.indexOf(path), 1);
        return false;
      }

      return true;
    });
  }

  /** Flushes locally cached minidumps from the queue. */
  public async flushQueue(): Promise<void> {
    await Promise.all(this._queue.get().map(async request => this.uploadMinidump(request)));
  }

  /** Scans the Crashpad directory structure for minidump files. */
  private async _scanCrashpadFolder(): Promise<string[]> {
    // Crashpad moves minidump files directly into the 'completed' or 'reports' folder. We can
    // load them from there, upload to the server, and then delete it.
    const dumpDirectory = join(this._crashesDirectory, this._crashpadSubDirectory);
    const files = await readdir(dumpDirectory);
    return files.filter(file => file.endsWith('.dmp')).map(file => join(dumpDirectory, file));
  }

  /** Scans the Breakpad directory structure for minidump files. */
  private async _scanBreakpadFolder(): Promise<string[]> {
    // Breakpad stores all minidump files along with a metadata file directly in
    // the crashes directory.
    const files = await readdir(this._crashesDirectory);

    // Remove all metadata files and forget about them.
    // tslint:disable-next-line: no-floating-promises
    Promise.all(
      files
        .filter(file => file.endsWith('.txt') && !file.endsWith('log.txt'))
        .map(async file => {
          const path = join(this._crashesDirectory, file);
          try {
            await unlink(path);
          } catch (e) {
            logger.warn('Could not delete', path);
          }
        }),
    );

    return files.filter(file => file.endsWith('.dmp')).map(file => join(this._crashesDirectory, file));
  }

  /**
   * Enqueues a minidump with event information for later upload.
   * @param request The request containing a minidump and event info.
   */
  private async _queueMinidump(request: MinidumpRequest): Promise<void> {
    const filename = basename(request.path);

    // Only enqueue if this minidump hasn't been enqueued before. Compare the
    // filename instead of the full path, because we will move the file to a
    // temporary location later on.
    if (this._queue.get().some(req => basename(req.path) === filename)) {
      return;
    }

    // Move the minidump file to a separate cache directory and enqueue it. Even
    // if the Electron CrashReporter's cache directory gets wiped or changes,
    // this will allow us to retry uploading the file later.
    const queuePath = join(this._cacheDirectory, filename);
    await mkdirp(this._cacheDirectory);
    await rename(request.path, queuePath);

    // Remove stale minidumps in case we go over limit. Note that we have to
    // re-fetch the queue as it might have changed in the meanwhile. It is
    // important to store the queue value again immediately to avoid phantom
    // reads.
    const requests = [...this._queue.get(), { ...request, path: queuePath }];
    const stale = requests.splice(-MAX_REQUESTS_COUNT);
    this._queue.set(requests);

    await Promise.all(
      stale.map(async req => {
        try {
          await unlink(req.path);
        } catch (e) {
          logger.warn('Could not delete', req.path);
        }
      }),
    );
  }
}
