// tslint:disable-next-line:no-submodule-imports
require('util.promisify/shim')();

import * as fs from 'fs';
import { platform } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import { DSN, SentryEvent } from '@sentry/core';
import * as FormData from 'form-data';
import fetch from 'node-fetch';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE = 30;

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
  public async uploadMinidump(path: string, event: SentryEvent): Promise<void> {
    // TODO: Queue and hold if there is no internet connection.
    // TODO: Only queue up to 10 events

    const body = new FormData();
    body.append('upload_file_minidump', fs.createReadStream(path));
    body.append('sentry', JSON.stringify(event));
    const response = await fetch(this.url, { method: 'POST', body });

    // TODO: Retry if the server responds with status code 429
    await unlink(path);
    this.knownPaths.splice(this.knownPaths.indexOf(path), 1);
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
}
