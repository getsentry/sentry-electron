import { Attachment } from '@sentry/types';
import { basename, logger } from '@sentry/utils';
import { join } from 'path';

import { getCrashesDirectory, usesCrashpad } from '../../electron-normalize';
import { readDirAsync, readFileAsync, statAsync, unlinkAsync } from '../../fs';

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE = 30;
/** Minimum number of seconds a minidump should not be modified for before we assume writing is complete */
const MIN_NOT_MODIFIED = 2;
const MINIDUMP_HEADER = 'MDMP';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type MinidumpLoader = (deleteAll: boolean, callback: (attachment: Attachment) => void) => Promise<void>;

/** Creates a minidump loader */
export function createMinidumpLoader(
  getMinidumpPaths: () => Promise<string[]>,
  preProcessFile: (file: Buffer) => Buffer = (file) => file,
): MinidumpLoader {
  // Keep track of which minidumps we are currently processing in case this function is called before we're finished
  const processingPaths: Set<string> = new Set();

  /** Deletes a file and removes it from the processing paths */
  async function cleanup(path: string): Promise<void> {
    try {
      await unlinkAsync(path);
    } catch (e) {
      logger.warn('Could not delete', path);
    } finally {
      processingPaths.delete(path);
    }
  }

  return async (deleteAll, callback) => {
    for (const path of await getMinidumpPaths()) {
      try {
        // Ignore non-minidump files
        if (!path.endsWith('.dmp')) {
          continue;
        }

        // Ignore minidumps we are already processing
        if (processingPaths.has(path)) {
          continue;
        }

        processingPaths.add(path);

        if (deleteAll) {
          await cleanup(path);
          continue;
        }

        logger.log('Found minidump', path);

        let stats = await statAsync(path);

        const thirtyDaysAgo = new Date().getTime() - MAX_AGE * 24 * 3_600 * 1_000;

        if (stats.birthtimeMs < thirtyDaysAgo) {
          logger.log(`Ignoring minidump as it is over ${MAX_AGE} days old`);
          await cleanup(path);
          continue;
        }

        let retries = 0;

        while (retries <= 10) {
          const twoSecondsAgo = new Date().getTime() - MIN_NOT_MODIFIED * 1_000;

          if (stats.mtimeMs < twoSecondsAgo) {
            const file = await readFileAsync(path);
            const data = preProcessFile(file);
            await cleanup(path);

            if (data.length < 10_000 || data.subarray(0, 4).toString() !== MINIDUMP_HEADER) {
              logger.warn('Dropping minidump as it appears invalid.');
              break;
            }

            logger.log('Sending minidump');

            callback({
              attachmentType: 'event.minidump',
              filename: basename(path),
              data,
            });

            break;
          }

          logger.log(`Minidump has been modified in the last ${MIN_NOT_MODIFIED} seconds. Checking again in a second.`);
          retries += 1;
          await delay(1_000);
          stats = await statAsync(path);
        }

        if (retries >= 10) {
          logger.warn('Timed out waiting for minidump to stop being modified');
          await cleanup(path);
        }
      } catch (e) {
        logger.error('Failed to load minidump', e);
        await cleanup(path);
      }
    }
  };
}

/** Attempts to remove the metadata file so Crashpad doesn't output `failed to stat report` errors to the console */
async function deleteCrashpadMetadataFile(crashesDirectory: string, waitMs: number = 100): Promise<void> {
  if (waitMs > 2_000) {
    return;
  }

  const metadataPath = join(crashesDirectory, 'metadata');
  try {
    await unlinkAsync(metadataPath);
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
      const files = await readDirAsync(path);
      found.push(...files.map((file) => join(path, file)));
    } catch (_) {
      //
    }
  }
  return found;
}

function crashpadMinidumpLoader(): MinidumpLoader {
  const crashesDirectory: string = getCrashesDirectory();
  const crashpadSubDirectory = process.platform === 'win32' ? 'reports' : 'completed';

  const dumpDirectories = [join(crashesDirectory, crashpadSubDirectory)];

  if (process.platform === 'darwin') {
    dumpDirectories.push(join(crashesDirectory, 'pending'));
  }

  return createMinidumpLoader(async () => {
    await deleteCrashpadMetadataFile(crashesDirectory).catch((error) => logger.error(error));
    return readDirsAsync(dumpDirectories);
  });
}

/** Crudely parses the minidump from the Breakpad multipart file */
function minidumpFromBreakpadMultipart(file: Buffer): Buffer {
  const binaryStart = file.lastIndexOf('Content-Type: application/octet-stream');
  if (binaryStart > 0) {
    const dumpStart = file.indexOf(MINIDUMP_HEADER, binaryStart);
    const dumpEnd = file.lastIndexOf('----------------------------');

    if (dumpStart > 0 && dumpEnd > 0 && dumpEnd > dumpStart) {
      return file.subarray(dumpStart, dumpEnd);
    }
  }

  return file;
}

function removeBreakpadMetadata(crashesDirectory: string, paths: string[]): void {
  // Remove all metadata files and forget about them.
  void Promise.all(
    paths
      .filter((file) => file.endsWith('.txt') && !file.endsWith('log.txt'))
      .map(async (file) => {
        const path = join(crashesDirectory, file);
        try {
          await unlinkAsync(path);
        } catch (e) {
          logger.warn('Could not delete', path);
        }
      }),
  );
}

function breakpadMinidumpLoader(): MinidumpLoader {
  const crashesDirectory: string = getCrashesDirectory();

  return createMinidumpLoader(async () => {
    // Breakpad stores all minidump files along with a metadata file directly in
    // the crashes directory.
    const files = await readDirAsync(crashesDirectory);
    removeBreakpadMetadata(crashesDirectory, files);
    return files;
  }, minidumpFromBreakpadMultipart);
}

/**
 * Gets the minidump loader
 */
export function getMinidumpLoader(): MinidumpLoader {
  return usesCrashpad() ? crashpadMinidumpLoader() : breakpadMinidumpLoader();
}
