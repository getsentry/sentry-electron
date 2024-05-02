const { readFileSync } = require('fs');

const versions = JSON.parse(readFileSync('./test/e2e/versions.json', 'utf8'));

if (process.env.GITHUB_REF && process.env.GITHUB_REF.includes('release/')) {
  // For release builds we test all versions
  console.log(JSON.stringify(versions));
} else {
  const versionCount = process.platform === 'darwin' ? -3 : -7;
  // Otherwise we test the oldest supported version and the last 3 or 7 versions depending on the platform
  console.log(JSON.stringify([versions[0], ...versions.slice(versionCount)]));
}
