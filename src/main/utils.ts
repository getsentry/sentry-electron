/**
 * Returns the major version of electron
 */
export function getElectronVersion(): { major: number; minor: number; patch: number } {
  const { groups } = /(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/.exec(process.versions.electron) || { groups: {} };
  return {
    major: parseInt(groups ? groups.major : '', 10),
    minor: parseInt(groups ? groups.minor : '', 10),
    patch: parseInt(groups ? groups.patch : '', 10),
  };
}
