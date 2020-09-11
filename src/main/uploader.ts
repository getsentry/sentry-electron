/* eslint-disable max-lines */
import { API } from '@sentry/core';
import { Event, Status, Transport } from '@sentry/types';
import { Dsn, logger, parseSemver, timestampWithMs } from '@sentry/utils';
import { basename, join } from 'path';

import { mkdirp, readDirAsync, readFileAsync, renameAsync, statAsync, unlinkAsync } from './fs';
import { Store } from './store';
import { NetTransport, SentryElectronRequest } from './transports/net';

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
  /** The type of the Electron CrashReporter used to search for Minidumps. */
  private readonly _type: CrashReporterType;

  /** The sub-directory where crashpad dumps can be found */
  private readonly _crashpadSubDirectory: string;

  /** List of minidumps that have been found already. */
  private readonly _knownPaths: string[];

  /**
   * Store to persist queued Minidumps beyond application crashes or lost
   * internet connection.
   */
  private readonly _queue: Store<MinidumpRequest[]>;

  /** API object */
  private readonly _api: API;

  /**
   * Creates a new uploader instance.
   *
   * @param dsn The Sentry DSN.
   * @param crashesDirectory The directory Electron stores crashes in.
   * @param cacheDirectory A persistent directory to cache minidumps.
   */
  public constructor(
    dsn: Dsn,
    private readonly _crashesDirectory: string,
    private readonly _cacheDirectory: string,
    private readonly _transport: Transport,
  ) {
    const crashpadWindows = process.platform === 'win32' && (parseSemver(process.versions.electron).major || 0) >= 6;
    this._type = process.platform === 'darwin' || crashpadWindows ? 'crashpad' : 'breakpad';
    this._crashpadSubDirectory = process.platform === 'darwin' ? 'completed' : 'reports';
    this._knownPaths = [];

    this._api = new API(dsn);
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof (this._transport as any).sendRequest !== 'function') {
      logger.warn("Your transport doesn't implement sendRequest");
      logger.warn('Skipping sending minidump');
      return;
    }
    logger.log('Sending minidump', request.path);

    const transport = this._transport as NetTransport;
    try {
      let response;
      if (!transport.isRateLimited('event')) {
        const requestForTransport = await this._toMinidumpRequest(transport, request.event, request.path);
        response = await transport.sendRequest(requestForTransport);
      }

      // We either succeeded or something went horribly wrong. Either way, we
      // can remove the minidump file.
      try {
        await unlinkAsync(request.path);
      } catch (e) {
        logger.warn('Could not delete', request.path);
      }

      // Forget this minidump in all caches
      // tslint:disable-next-line: strict-comparisons
      this._queue.update(queued => queued.filter(stored => stored !== request));
      this._knownPaths.splice(this._knownPaths.indexOf(request.path), 1);

      // If we were successful, we can try to flush the remaining queue
      if (response && response.status === Status.Success) {
        await this.flushQueue();
      }
    } catch (err) {
      // TODO: Test this
      logger.warn('Failed to upload minidump', err);

      // User's internet connection was down so we queue it as well
      const error = err ? (err as { code: string }) : { code: '' };
      if (error.code === 'ENOTFOUND') {
        await this._queueMinidump(request);
      }
    }
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
      const stats = await statAsync(path);
      if (stats.birthtimeMs < oldestMs) {
        try {
          await unlinkAsync(path);
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

  /** Scans the Crashpad directory structure for minidump files. */
  private async _scanCrashpadFolder(): Promise<string[]> {
    // Crashpad moves minidump files directly into the 'completed' or 'reports' folder. We can
    // load them from there, upload to the server, and then delete it.
    const dumpDirectory = join(this._crashesDirectory, this._crashpadSubDirectory);
    const files = await readDirAsync(dumpDirectory);
    return files.filter(file => file.endsWith('.dmp')).map(file => join(dumpDirectory, file));
  }

  /** Scans the Breakpad directory structure for minidump files. */
  private async _scanBreakpadFolder(): Promise<string[]> {
    // Breakpad stores all minidump files along with a metadata file directly in
    // the crashes directory.
    const files = await readDirAsync(this._crashesDirectory);

    // Remove all metadata files and forget about them.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Promise.all(
      files
        .filter(file => file.endsWith('.txt') && !file.endsWith('log.txt'))
        .map(async file => {
          const path = join(this._crashesDirectory, file);
          try {
            await unlinkAsync(path);
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
    await renameAsync(request.path, queuePath);

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
          await unlinkAsync(req.path);
        } catch (e) {
          logger.warn('Could not delete', req.path);
        }
      }),
    );
  }

  /**
   * Create minidump request to dispatch to the transpoirt
   */
  private async _toMinidumpRequest(
    transport: NetTransport,
    event: Event,
    minidumpPath: string,
  ): Promise<SentryElectronRequest> {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      // Internal helper that uses `perf_hooks` to get clock reading
      sent_at: new Date(timestampWithMs() * 1000).toISOString(),
    });

    // If attachments are ratelimited we add this hint so users know
    if (transport.isRateLimited('attachment')) {
      event.message = 'Ratelimited - Minidump Event';
    }

    const itemHeaders = JSON.stringify({
      content_type: 'application/json',
      type: 'event',
    });

    const eventPayload = JSON.stringify(event);
    let bodyBuffer = Buffer.from(`${envelopeHeaders}\n${itemHeaders}\n${eventPayload}\n`);

    // Only add attachment if they are not rate limited
    if (!transport.isRateLimited('attachment')) {
      const minidumpContent = (await readFileAsync(minidumpPath)) as Buffer;
      const minidumpHeader = JSON.stringify({
        attachment_type: 'event.minidump',
        length: minidumpContent.length,
        type: 'attachment',
        filename: basename(minidumpPath),
      });

      bodyBuffer = Buffer.concat([bodyBuffer, Buffer.from(`${minidumpHeader}\n`), minidumpContent, Buffer.from('\n')]);
    } else {
      logger.warn('Will not add minidump to request since they are rate limited.');
    }

    return {
      body: bodyBuffer,
      url: this._api.getEnvelopeEndpointWithUrlEncodedAuth(),
    };
  }
}
