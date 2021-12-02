import { NodeOptions } from '@sentry/node';
import { Transport } from '@sentry/types';
import { forget, logger } from '@sentry/utils';
import { join } from 'path';

import { getCrashesDirectory } from '../../electron-normalize';
import { readDirAsync, unlinkAsync } from '../../fs';
import { BaseUploader } from './base-uploader';

/** */
export class CrashpadUploader extends BaseUploader {
  private readonly _crashesDirectory: string = getCrashesDirectory();

  /** The sub-directory where crashpad dumps can be found */
  private readonly _crashpadSubDirectory: string;

  public constructor(options: NodeOptions, transport: Transport) {
    super(options, transport);
    this._crashpadSubDirectory = process.platform === 'win32' ? 'reports' : 'completed';
  }

  /** @inheritdoc */
  protected async _getMinidumpPaths(): Promise<string[]> {
    forget(this._deleteCrashpadMetadataFile());

    // Crashpad moves minidump files directly into the 'completed' or 'reports' folder. We can
    // load them from there, upload to the server, and then delete them.
    const dumpDirectory = join(this._crashesDirectory, this._crashpadSubDirectory);
    const files = await readDirAsync(dumpDirectory);
    return files.filter((file) => file.endsWith('.dmp')).map((file) => join(dumpDirectory, file));
  }

  /** @inheritdoc */
  protected _preProcessFile(file: Buffer): Buffer | undefined {
    return file;
  }

  /** Attempts to remove the metadata file so Crashpad doesn't output `failed to stat report` errors to the console */
  private async _deleteCrashpadMetadataFile(waitMs: number = 100): Promise<void> {
    if (waitMs > 2_000) {
      return;
    }

    const metadataPath = join(this._crashesDirectory, 'metadata');
    try {
      await unlinkAsync(metadataPath);
      logger.log('Deleted Crashpad metadata file', metadataPath);
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (e.code && e.code == 'EBUSY') {
        // Since Crashpad probably still has the metadata file open, we make a few attempts to delete it, backing
        // off and waiting longer each time.
        setTimeout(async () => {
          await this._deleteCrashpadMetadataFile(waitMs * 2);
        }, waitMs);
      }
    }
  }
}
