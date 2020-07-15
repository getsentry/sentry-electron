/**
 * Returns the major version of electron
 */
export function getElectronVersion(): { major: number; minor: number; patch: number } {
  const versions = process.versions.electron.split('.').map(val => parseInt(val, 10));
  return {
    major: versions[0],
    minor: versions[1],
    patch: versions[2],
  };
}
