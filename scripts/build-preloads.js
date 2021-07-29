const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const ts = require('typescript');

function readFile(path) {
  return readFileSync(join(__dirname, path), { encoding: 'utf8' });
}

const ipcModule = readFile('../src/ipc.ts');

function transpileFile(path) {
  let file = readFile(path)
    // Since we're not doing proper bundling we need to replace the ipc import with the code 😋!
    .replace("import { IPC } from '../ipc';", ipcModule);

  return ts.transpile(file, { removeComments: true });
}

const template = readFile('../src/preload/bundled.template.ts');

writeFileSync(
  join(__dirname, '../src/preload/bundled.ts'),
  template
    .replace('{{hook-ipc.js}}', transpileFile('../src/preload/hook-ipc.ts'))
    .replace('{{start-native.js}}', transpileFile('../src/preload/start-native.ts')),
);
