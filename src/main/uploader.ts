import * as fs from 'fs';
import { basename, join } from 'path';
import { promisify } from 'util';

import { DSN } from '@sentry/core';
import { SentryEvent, SentryResponse } from '@sentry/types';
import { filterAsync } from '@sentry/utils/async';
import { mkdirp } from '@sentry/utils/fs';
import { Store } from '@sentry/utils/store';
import fetch = require('electron-fetch');
import FormData = require('form-data');

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
  event: SentryEvent;
}

/**
 * A service that discovers Minidump crash reports and uploads them to Sentry.
 */
export class MinidumpUploader {
  /** The minidump ingestion endpoint URL. */
  private readonly url: string;

  /** The type of the Electron CrashReporter used to search for Minidumps. */
  private readonly type: CrashReporterType;

  /** List of minidumps that have been found already. */
  private readonly knownPaths: string[];

  /**
   * Store to persist queued Minidumps beyond application crashes or lost
   * internet connection.
   */
  private readonly queue: Store<MinidumpRequest[]> = new Store(
    this.cacheDirectory,
    'queue',
    [],
  );

  /**
   * Creates a new uploader instance.
   *
   * @param dsn The Sentry DSN.
   * @param crashesDirectory The directory Electron stores crashes in.
   * @param cacheDirectory A persistent directory to cache minidumps.
   */
  public constructor(
    dsn: DSN,
    private readonly crashesDirectory: string,
    private readonly cacheDirectory: string,
  ) {
    this.type = process.platform === 'darwin' ? 'crashpad' : 'breakpad';
    this.knownPaths = [];

    const { host, path, port, protocol, user } = dsn;
    this.url =
      `${protocol}://${host}${port !== '' ? `:${port}` : ''}` +
      `/api/${path}/minidump?sentry_key=${user}`;
  }

  /**
   * Uploads a minidump file to Sentry.
   *
   * @param path Absolute path to the minidump file.
   * @param event Event data to attach to the minidump.
   * @returns A promise that resolves when the upload is complete.
   */
  public async uploadMinidump(
    request: MinidumpRequest,
  ): Promise<SentryResponse> {
    try {
      const body = new FormData();
      body.append('upload_file_minidump', fs.createReadStream(request.path));
      body.append('sentry', JSON.stringify(request.event));
      const response = await fetch(this.url, { method: 'POST', body });

      // Too many requests, so we queue the event and send it later
      if (response.status === CODE_RETRY) {
        await this.queueMinidump(request);
        // TODO
        return {
          code: CODE_RETRY,
        };
      }

      // We either succeeded or something went horribly wrong. Either way, we
      // can remove the minidump file.
      await unlink(request.path);

      // Forget this minidump in all caches
      this.queue.update(queued => queued.filter(stored => stored !== request));
      this.knownPaths.splice(this.knownPaths.indexOf(request.path), 1);

      // If we were successful, we can try to flush the remaining queue
      if (response.ok) {
        await this.flushQueue();
      }

      // TODO
      return { code: response.status };
    } catch (err) {
      // User's internet connection was down so we queue it as well
      const error = err ? (err as { code: string }) : { code: '' };
      if (error.code === 'ENOTFOUND') {
        await this.queueMinidump(request);
      }

      // TODO
      return { code: 500 };
    }
  }

  /**
   * Searches for new, unknown minidump files in the crash directory.
   * @returns A promise that resolves to absolute paths of those dumps.
   */
  public async getNewMinidumps(): Promise<string[]> {
    const minidumps =
      this.type === 'crashpad'
        ? await this.scanCrashpadFolder()
        : await this.scanBreakpadFolder();

    const oldestMs = new Date().getTime() - MAX_AGE * 24 * 3600 * 1000;
    return filterAsync(minidumps, async path => {
      // Skip files that we have seen before
      if (this.knownPaths.indexOf(path) >= 0) {
        return false;
      }

      // Lock this minidump until we have uploaded it or an error occurs and we
      // remove it from the file system.
      this.knownPaths.push(path);

      // We do not want to upload minidumps that have been generated before a
      // certain threshold. Those old files can be deleted immediately.
      const stats = await stat(path);
      if (stats.birthtimeMs < oldestMs) {
        await unlink(path);
        this.knownPaths.splice(this.knownPaths.indexOf(path), 1);
        return false;
      }

      return true;
    });
  }

  /** Flushes locally cached minidumps from the queue. */
  public async flushQueue(): Promise<void> {
    await Promise.all(
      this.queue.get().map(async request => this.uploadMinidump(request)),
    );
  }

  /** Scans the Crashpad directory structure for minidump files. */
  private async scanCrashpadFolder(): Promise<string[]> {
    // Crashpad moves minidump files directly into the completed/ folder. We can
    // load them from there, upload to the server, and then delete it.
    const dumpDirectory = join(this.crashesDirectory, 'completed');
    const files = await readdir(dumpDirectory);
    return files
      .filter(file => file.endsWith('.dmp'))
      .map(file => join(dumpDirectory, file));
  }

  /** Scans the Breakpad directory structure for minidump files. */
  private async scanBreakpadFolder(): Promise<string[]> {
    // Breakpad stores all minidump files along with a metadata file directly in
    // the crashes directory.
    const files = await readdir(this.crashesDirectory);

    // Remove all metadata files (asynchronously) and forget about them.
    files
      .filter(file => file.endsWith('.txt') && !file.endsWith('log.txt'))
      .forEach(async file => unlink(join(this.crashesDirectory, file)));

    return files
      .filter(file => file.endsWith('.dmp'))
      .map(file => join(this.crashesDirectory, file));
  }

  /**
   * Enqueues a minidump with event information for later upload.
   * @param request The request containing a minidump and event info.
   */
  private async queueMinidump(request: MinidumpRequest): Promise<void> {
    const filename = basename(request.path);

    // Only enqueue if this minidump hasn't been enqueued before. Compare the
    // filename instead of the full path, because we will move the file to a
    // temporary location later on.
    if (this.queue.get().some(req => basename(req.path) === filename)) {
      return;
    }

    // Move the minidump file to a separate cache directory and enqueue it. Even
    // if the Electron CrashReporter's cache directory gets wiped or changes,
    // this will allow us to retry uploading the file later.
    const queuePath = join(this.cacheDirectory, filename);
    await mkdirp(this.cacheDirectory);
    await rename(request.path, queuePath);

    // Remove stale minidumps in case we go over limit. Note that we have to
    // re-fetch the queue as it might have changed in the meanwhile. It is
    // important to store the queue value again immediately to avoid phantom
    // reads.
    const requests = [...this.queue.get(), { ...request, path: queuePath }];
    const stale = requests.splice(-MAX_REQUESTS_COUNT);
    this.queue.set(requests);

    await Promise.all(stale.map(async req => unlink(req.path)));
  }
}
