import { Attachment, logger } from '@sentry/core';
import { app } from 'electron';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

import { Mutex } from '../../mutex';
import { MinidumpParseResult, parseMinidump } from './minidump-parser';

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE_DAYS = 30;
const MS_PER_DAY = 24 * 3_600 * 1_000;
/** Minimum number of milliseconds a minidump should not be modified for before we assume writing is complete */
const NOT_MODIFIED_MS = 1_000;
const MAX_RETRY_MS = 5_000;
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = MAX_RETRY_MS / RETRY_DELAY_MS;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A function that loads minidumps
 * @param deleteAll Whether to just delete all minidumps
 * @param callback A callback to call with the attachment ready to send
 */
export type MinidumpLoader = (
  deleteAll: boolean,
  callback: (minidump: MinidumpParseResult, attachment: Attachment) => Promise<void>,
) => Promise<void>;

/**
 * Creates a minidump loader
 * @param getMinidumpPaths A function that returns paths to minidumps
 * @param preProcessFile A function that pre-processes the minidump file
 * @returns A function to fetch minidumps
 */
export function createMinidumpLoader(getMinidumpPaths: () => Promise<string[]>): MinidumpLoader {
  // The mutex protects against a whole host of reentrancy issues and race conditions.
  const mutex = new Mutex();

  return async (deleteAll, callback) => {
    // any calls to this function will be queued and run exclusively
    await mutex.runExclusive(async () => {
      for (const path of await getMinidumpPaths()) {
        try {
          if (deleteAll) {
            continue;
          }

          logger.log('Found minidump', path);

          let stats = await fs.stat(path);

          const thirtyDaysAgo = new Date().getTime() - MAX_AGE_DAYS * MS_PER_DAY;

          if (stats.mtimeMs < thirtyDaysAgo) {
            logger.log(`Ignoring minidump as it is over ${MAX_AGE_DAYS} days old`);
            continue;
          }

          let retries = 0;

          while (retries <= MAX_RETRIES) {
            const twoSecondsAgo = new Date().getTime() - NOT_MODIFIED_MS;

            if (stats.mtimeMs < twoSecondsAgo) {
              const data = await fs.readFile(path);
              try {
                const parsedMinidump = parseMinidump(data);

                logger.log('Sending minidump');

                await callback(parsedMinidump, {
                  attachmentType: 'event.minidump',
                  filename: basename(path),
                  data,
                });
              } catch (e) {
                const message = e instanceof Error ? e.toString() : 'Unknown error';
                logger.warn(`Dropping minidump:\n${message}`);
                break;
              }

              break;
            }

            logger.log(`Waiting. Minidump has been modified in the last ${NOT_MODIFIED_MS} milliseconds.`);
            retries += 1;
            await delay(RETRY_DELAY_MS);
            // update the stats
            stats = await fs.stat(path);
          }

          if (retries >= MAX_RETRIES) {
            logger.warn('Timed out waiting for minidump to stop being modified');
          }
        } catch (e) {
          logger.error('Failed to load minidump', e);
        } finally {
          // We always attempt to delete the minidump
          try {
            await fs.unlink(path);
          } catch (e) {
            logger.warn('Could not delete minidump', path);
          }
        }
      }
    });
  };
}

/** Attempts to remove the metadata file so Crashpad doesn't output `failed to stat report` errors to the console */
async function deleteCrashpadMetadataFile(crashesDirectory: string, waitMs: number = 100): Promise<void> {
  if (waitMs > 2_000) {
    return;
  }

  const metadataPath = join(crashesDirectory, 'metadata');
  try {
    await fs.unlink(metadataPath);
    logger.log('Deleted Crashpad metadata file', metadataPath);
  } catch (e: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (e.code && e.code == 'EBUSY') {
      // Since Crashpad probably still has the metadata file open, we make a few attempts to delete it, backing
      // off and waiting longer each time.
      setTimeout(async () => {
        await deleteCrashpadMetadataFile(crashesDirectory, waitMs * 2);
      }, waitMs);
    }
  }
}

async function readDirsAsync(paths: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const path of paths) {
    try {
      const files = await fs.readdir(path);
      found.push(...files.map((file) => join(path, file)));
    } catch (_) {
      //
    }
  }
  return found;
}

/**
 * Gets the crashpad minidump loader
 */
export function getMinidumpLoader(): MinidumpLoader {
  const crashesDirectory: string = app.getPath('crashDumps');
  const crashpadSubDirectory = process.platform === 'win32' ? 'reports' : 'completed';

  const dumpDirectories = [join(crashesDirectory, crashpadSubDirectory)];

  if (process.platform === 'darwin') {
    dumpDirectories.push(join(crashesDirectory, 'pending'));
  }

  return createMinidumpLoader(async () => {
    await deleteCrashpadMetadataFile(crashesDirectory).catch((error) => logger.error(error));
    const files = await readDirsAsync(dumpDirectories);
    return files.filter((file) => file.endsWith('.dmp'));
  });
}
