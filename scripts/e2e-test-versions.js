const { readFileSync } = require('fs');

const versions = JSON.parse(readFileSync('./test/e2e/versions.json', 'utf8'));

// GitHub Actions limits a job matrix to 256 configurations. The e2e matrix
// multiplies each Electron version by 3 operating systems and 4 shards (12),
// so we can test at most floor(256 / 12) = 21 Electron versions.
const MAX_VERSIONS = 21;

// Always test the oldest supported version, then fill the remaining budget with
// the newest versions.
function selectVersions(count) {
  if (versions.length <= count) {
    return versions;
  }
  return [...new Set([versions[0], ...versions.slice(versions.length - (count - 1))])];
}

if (process.env.GITHUB_REF && process.env.GITHUB_REF.includes('release/')) {
  // For release builds we test the oldest supported version and as many of the
  // newest versions as the matrix limit allows.
  console.log(JSON.stringify(selectVersions(MAX_VERSIONS)));
} else {
  // Otherwise we test the oldest supported version and the last 3 or 7 versions depending on the platform
  const versionCount = process.platform === 'darwin' ? 3 : 7;
  console.log(JSON.stringify(selectVersions(versionCount + 1)));
}
