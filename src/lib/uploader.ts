// tslint:disable-next-line:no-submodule-imports
require('util.promisify/shim')();

import * as fs from 'fs';
import { platform } from 'os';
import { basename, join } from 'path';
import { promisify } from 'util';

import { DSN, SentryEvent } from '@sentry/core';
import * as FormData from 'form-data';
import fetch from 'node-fetch';

import Store from './store';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE = 30;

/** Maximum number of requests that we store/queue if something goes wrong. */
const MAX_REQUESTS_COUNT = 10;

/** Path to the place where we keep stored/queued minidumps for requests */
const MINIDUMPS_CACHE_PATH = join(Store.getBasePath(), 'minidumps');

/** Helper to filter an array with asynchronous callbacks. */
export async function filterAsync<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean>,
  thisArg?: any,
): Promise<T[]> {
  const verdicts = await Promise.all(array.map(predicate, thisArg));
  return array.filter((element, index) => verdicts[index]);
}

/** Supported types of Electron CrashReporters. */
type CrashReporterType = 'crashpad' | 'breakpad';

export interface MinidumpRequest {
  /** Path to the minidump file */
  path: string;
  /** Associated event */
  event: SentryEvent;
}

/**
 * A service that discovers Minidump crash reports and uploads them to Sentry.
 */
export default class MinidumpUploader {
  /** The minidump ingestion endpoint URL. */
  private url: string;
  /** The type of the Electron CrashReporter used to search for Minidumps. */
  private type: CrashReporterType;
  /** List of minidumps that have been found already. */
  private knownPaths: string[];
  /** Store to persist queued Minidumps beyond application crashes or lost internet connection. */
  private queue: Store<MinidumpRequest[]> = new Store('minidump-requests.json');

  /**
   * Creates a new uploader instance.
   *
   * @param dsn The Sentry DSN
   * @param crashesDirectory The directory Electron stores crashes in.
   */
  constructor(dsn: DSN, private crashesDirectory: string) {
    this.type = platform() === 'darwin' ? 'crashpad' : 'breakpad';
    this.knownPaths = [];

    const { host, path, port, protocol, user } = dsn;
    this.url =
      `${protocol}://${host}${port ? ':' + port : ''}` +
      `/api/${path}/minidump?sentry_key=${user}`;
  }

  /**
   * Uploads a minidump file to Sentry.
   *
   * @param path Absolute path to the minidump file.
   * @param event Event data to attach to the minidump.
   * @returns A promise that resolves when the upload is complete.
   */
  public async uploadMinidump(request: MinidumpRequest): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        body: this.createMinidumpRequestBody(request),
      });
      // Too many requests, so we queue the event and send it later
      if (response.status === 429) {
        await this.queueMinidumpRequest(request);
      } else {
        // We either succeeded or something went horribly wrong
        // Either way, we can remove the minidump file
        await unlink(request.path);
        this.knownPaths.splice(this.knownPaths.indexOf(request.path), 1);
      }
    } catch (err) {
      // User's internet connection was down so we queue it as well
      if (err.code === 'ENOTFOUND') {
        await this.queueMinidumpRequest(request);
      }
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
    return filterAsync(minidumps, async (path: string) => {
      // Skip files that we have seen before
      if (this.knownPaths.indexOf(path) >= 0) {
        return false;
      }

      // We do not want to upload minidumps that have been generated before a
      // certain threshold. Those old files can be deleted immediately.
      const stats = await stat(path);
      if (stats.birthtimeMs < oldestMs) {
        await unlink(path);
        return false;
      }

      // Remember this file until we remove it from the file system
      this.knownPaths.push(path);
      return true;
    });
  }

  /** Scans the Crashpad directory structure for minidump files. */
  private async scanCrashpadFolder(): Promise<string[]> {
    // Crashpad moves minidump files directly into the completed/ folder. We
    // can load them from there, upload to the server, and then delete it.
    const dumpDirectory = join(this.crashesDirectory, 'completed');
    const files = await readdir(dumpDirectory);
    return files
      .filter(file => file.endsWith('.dmp'))
      .map(file => join(dumpDirectory, file));
  }

  /** Scans the Breakpad directory structure for minidump files. */
  private async scanBreakpadFolder(): Promise<string[]> {
    // Breakpad stores all minidump files along with a metadata file directly
    // in the crashes directory.
    const files = await readdir(this.crashesDirectory);

    // Remove all metadata files (asynchronously) and forget about them.
    files
      .filter(file => file.endsWith('.txt') && !file.endsWith('log.txt'))
      .forEach(file => unlink(join(this.crashesDirectory, file)));

    return files
      .filter(file => file.endsWith('.dmp'))
      .map(file => join(this.crashesDirectory, file));
  }

  private createMinidumpRequestBody(request: MinidumpRequest): FormData {
    const body = new FormData();
    body.append('upload_file_minidump', fs.createReadStream(request.path));
    body.append('sentry', JSON.stringify(request.event));
    return body;
  }

  private getMinidumpsCachePath(): string {
    if (!fs.existsSync(MINIDUMPS_CACHE_PATH)) {
      fs.mkdirSync(MINIDUMPS_CACHE_PATH);
    }
    return MINIDUMPS_CACHE_PATH;
  }

  private async queueMinidumpRequest(request: MinidumpRequest): Promise<void> {
    const storedRequests = this.queue.get();

    // Remove stale minidumps in case we go over limit
    await Promise.all(
      storedRequests
        .slice(MAX_REQUESTS_COUNT)
        .map(storedRequest => unlink(storedRequest.path)),
    );

    // Copy current minidump in our store directory
    const basePath = this.getMinidumpsCachePath();
    const filename = basename(request.path);
    const cachePath = join(basePath, filename);

    fs.copyFileSync(request.path, cachePath);

    // Create new array of requests and take last N items
    // Save it with the new path that points to copied dump
    const newRequests = [
      ...storedRequests,
      {
        ...request,
        path: cachePath,
      },
    ].slice(-MAX_REQUESTS_COUNT);

    this.queue.set(newRequests);
  }
}
