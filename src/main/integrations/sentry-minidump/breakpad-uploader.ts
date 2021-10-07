import { NodeOptions } from '@sentry/node';
import { Transport } from '@sentry/types';
import { logger } from '@sentry/utils';
import { join } from 'path';

import { getCrashesDirectory } from '../../electron-normalize';
import { readDirAsync, unlinkAsync } from '../../fs';
import { BaseUploader } from './base-uploader';

/** */
export class BreakpadUploader extends BaseUploader {
  private readonly _crashesDirectory: string = getCrashesDirectory();

  public constructor(options: NodeOptions, cacheDirectory: string, transport: Transport) {
    super(options, cacheDirectory, transport);
  }

  /** @inheritdoc */
  protected async _getMinidumpPaths(): Promise<string[]> {
    // Breakpad stores all minidump files along with a metadata file directly in
    // the crashes directory.
    const files = await readDirAsync(this._crashesDirectory);

    // Remove all metadata files and forget about them.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Promise.all(
      files
        .filter((file) => file.endsWith('.txt') && !file.endsWith('log.txt'))
        .map(async (file) => {
          const path = join(this._crashesDirectory, file);
          try {
            await unlinkAsync(path);
          } catch (e) {
            logger.warn('Could not delete', path);
          }
        }),
    );

    return files.filter((file) => file.endsWith('.dmp')).map((file) => join(this._crashesDirectory, file));
  }

  /** Crudely parses the dump file from the Breakpad multipart file */
  protected _preProcessFile(file: Buffer): Buffer | undefined {
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
}
