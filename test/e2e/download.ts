import { downloadArtifact as electronDownload } from '@electron/get';
import { spawnSync } from 'child_process';
import { default as electronExtract } from 'extract-zip';
import { existsSync } from 'fs';
import { join } from 'path';

function isMacArm64(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

  // Check if this machine is Apple silicone. This cputype might only match M1 for now...
  const output = spawnSync('sysctl', ['hw.cputype']).output?.toString();
  return output?.includes('16777228');
}

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
export async function downloadElectron(version: string): Promise<string> {
  // We override the arch on Mac arm64 when we're running on node x64 because Crashpad doesn't work on x64 Electron
  // running in Rosetta...
  const arch = isMacArm64() ? 'arm64' : 'x64';
  const cacheDir = join(process.env.ELECTRON_CACHE_DIR ?? getHomDir(), '.cache');
  const dir = join(cacheDir, `${version}-${arch}`);

  if (!existsSync(dir)) {
    const zipPath = await electronDownload({ version, arch, artifactName: 'electron' });
    await electronExtract(zipPath, { dir });
  }

  return join(dir, getExecutablePath());
}
