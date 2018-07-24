import download = require('electron-download');
import extract = require('extract-zip');
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const electronDownload = promisify(download);
const electronExtract = promisify(extract);

/** Gets the users home directory */
function getHomDir(): string {
  return process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'] || '';
}

/** Gets the path to the Electron executable */
function getExecutablePath(): string {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe';
    case 'darwin':
      return 'electron.app/Contents/MacOS/electron';
    default:
      return 'electron';
  }
}

/**
 * Downloads and unpacks the requested Electron version
 *
 * @export
 * @param version The Electron version
 * @param arch The Electron arch
 * @returns Path to the Electron executable
 */
export async function downloadElectron(version: string, arch: string): Promise<string> {
  const dir = join(getHomDir(), '.cache', `${version}-${arch}`);

  if (!existsSync(dir)) {
    const zipPath = await electronDownload({ version, arch });
    await electronExtract(zipPath, { dir });
  }

  return join(dir, getExecutablePath());
}
