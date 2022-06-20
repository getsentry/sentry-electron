import { logger } from '@sentry/utils';
import { join } from 'path';

import { getCrashesDirectory, usesCrashpad } from '../../electron-normalize';
import { readDirAsync, readFileAsync, statAsync, unlinkAsync } from '../../fs';

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE = 30;

export interface MinidumpFile {
  path: string;
  load(): Promise<Uint8Array | undefined>;
}

export type MinidumpLoader = () => Promise<MinidumpFile[]>;

async function filterAsync<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean> | boolean,
  thisArg?: any,
): Promise<T[]> {
  const verdicts = await Promise.all(array.map(predicate, thisArg));
  return array.filter((_, index) => verdicts[index]);
}

/** Deletes a minidump */
export async function deleteMinidump(dump: MinidumpFile): Promise<void> {
  try {
    await unlinkAsync(dump.path);
  } catch (e) {
    logger.warn('Could not delete', dump.path);
  }
}

function createMinidumpLoader(fetchMinidumpsImpl: MinidumpLoader): MinidumpLoader {
  const knownPaths: string[] = [];

  return async () => {
    const minidumps = await fetchMinidumpsImpl();
    logger.log(`Found ${minidumps.length} minidumps`);

    const oldestMs = new Date().getTime() - MAX_AGE * 24 * 3_600 * 1_000;
    return filterAsync(minidumps, async (dump) => {
      // Skip files that we have seen before
      if (knownPaths.indexOf(dump.path) >= 0) {
        return false;
      }

      // Lock this minidump until we have uploaded it or an error occurs and we
      // remove it from the file system.
      knownPaths.push(dump.path);

      // We do not want to upload minidumps that have been generated before a
      // certain threshold. Those old files can be deleted immediately.
      const stats = await statAsync(dump.path);
      if (stats.birthtimeMs < oldestMs) {
        await deleteMinidump(dump);
        knownPaths.splice(knownPaths.indexOf(dump.path), 1);
        return false;
      }

      return true;
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

function crashpadMinidumpLoader(): MinidumpLoader {
  const crashesDirectory: string = getCrashesDirectory();
  const crashpadSubDirectory = process.platform === 'win32' ? 'reports' : 'completed';

  return createMinidumpLoader(async () => {
    await deleteCrashpadMetadataFile(crashesDirectory).catch((error) => logger.error(error));

    const dumpDirectory = join(crashesDirectory, crashpadSubDirectory);

    return (await readDirAsync(dumpDirectory))
      .filter((file) => file.endsWith('.dmp'))
      .map((file) => {
        const path = join(dumpDirectory, file);

        return {
          path,
          load: () => readFileAsync(path),
        };
      });
  });
}

/** Crudely parses the minidump from the Breakpad multipart file */
function minidumpFromBreakpadMultipart(file: Buffer): Buffer | undefined {
  const binaryStart = file.lastIndexOf('Content-Type: application/octet-stream');
  if (binaryStart > 0) {
    const dumpStart = file.indexOf('MDMP', binaryStart);
    const dumpEnd = file.lastIndexOf('----------------------------');

    if (dumpStart > 0 && dumpEnd > 0 && dumpEnd > dumpStart) {
      return file.slice(dumpStart, dumpEnd);
    }
  }

  return undefined;
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

    return files
      .filter((file) => file.endsWith('.dmp'))
      .map((file) => {
        const path = join(crashesDirectory, file);

        return {
          path,
          load: async () => {
            const file = await readFileAsync(path);
            return minidumpFromBreakpadMultipart(file) || file;
          },
        };
      })
      .filter((m) => !!m);
  });
}

/**
 * Gets the minidump loader
 */
export function getMinidumpLoader(): MinidumpLoader {
  return usesCrashpad() ? crashpadMinidumpLoader() : breakpadMinidumpLoader();
}
