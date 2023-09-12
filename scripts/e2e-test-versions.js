const { readFileSync } = require('fs');

const versions = JSON.parse(readFileSync('./test/e2e/versions.json', 'utf8'));

// if (process.env.GITHUB_REF && process.env.GITHUB_REF.includes('release/')) {
// For release builds we test all versions
console.log(JSON.stringify(versions));
// } else {
// Otherwise we test the oldest version and the last 10 versions
// console.log(JSON.stringify([versions[0], ...versions.slice(-10)]));
// }
