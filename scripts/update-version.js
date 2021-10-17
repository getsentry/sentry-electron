const { join } = require('path');
const { readFileSync, writeFileSync } = require('fs');

const version = require('../package.json').version;
const path = join(__dirname, '../src/main/version.ts');
const code = readFileSync(path, { encoding: 'utf8' });
const modified = code.replace(/SDK_VERSION = '[\S\.]*'/, `SDK_VERSION = '${version}'`);
writeFileSync(path, modified);
