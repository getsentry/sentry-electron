const { readFileSync } = require('fs');

const versions = JSON.parse(readFileSync('./test/e2e/versions.json', 'utf8'));

// We test the oldest version and the last 10 versions
console.log(JSON.stringify([versions[0], ...versions.slice(-10)]));
