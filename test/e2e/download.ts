import download = require('electron-download');
import extract = require('extract-zip');
import { join } from 'path';
import { existsSync } from 'fs';
import { promisify } from 'util';

const electronDownload = promisify(download);
const electronExtract = promisify(extract);

function getHomDir(): string {
  return (
    process.env[process.platform == 'win32' ? 'USERPROFILE' : 'HOME'] || ''
  );
}

export async function getPathToElectron(version: string): Promise<string> {
  const dir = join(getHomDir(), '.cache', version);

  if (!existsSync(dir)) {
    const zipPath = await electronDownload({ version });
    await electronExtract(zipPath, { dir });
  }

  return join(dir, 'electron.exe');
}
