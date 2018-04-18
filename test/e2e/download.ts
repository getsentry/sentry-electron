import download = require('electron-download');
import extract = require('extract-zip');
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const electronDownload = promisify(download);
const electronExtract = promisify(extract);

function getHomDir(): string {
  return (
    process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'] || ''
  );
}

function getExecutableName() {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe';
    case 'darwin':
      return 'electron.app/Contents/MacOS/electron'
    default:
      return 'electron';
  }
}

export async function getElectronPath(version: string): Promise<string> {
  const dir = join(getHomDir(), '.cache', version);

  if (!existsSync(dir)) {
    const zipPath = await electronDownload({ version });
    await electronExtract(zipPath, { dir });
  }

  return join(dir, getExecutableName());
}
