const { join } = require('path');
const { writeFileSync } = require('fs');

const path = join(__dirname, '../src/main/version.ts');
const version = require('../package.json').version;
writeFileSync(path, `export const SDK_VERSION = '${version}';\n`);
