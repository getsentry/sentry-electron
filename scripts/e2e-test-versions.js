const { readFileSync } = require('fs');

let versions = JSON.parse(readFileSync('./test/e2e/versions.json', 'utf8'));

// Electron v20 exits immediately on macOS arch64 in GitHub Actions with SIGTRAP
if (process.env.CI && process.platform === 'darwin') {
  versions = versions.filter((version) => !version.startsWith('20.'));
}

if (process.env.GITHUB_REF && process.env.GITHUB_REF.includes('release/')) {
  // For release builds we test all versions
  console.log(JSON.stringify(versions));
} else {
  const versionCount = process.platform === 'darwin' ? -3 : -7;
  // Otherwise we test the oldest supported version and the last 3 or 7 versions depending on the platform
  console.log(JSON.stringify([versions[0], ...versions.slice(versionCount)]));
}
