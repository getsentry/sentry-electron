const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const ts = require('typescript');

const ipcModule = readFileSync(join(__dirname, '../src/ipc.ts'), { encoding: 'utf8' });

function transpileFile(path) {
  let file = readFileSync(join(__dirname, path), { encoding: 'utf8' })
    // Since we're not doing proper bundling we need to replace the ipc import with the code 😋!
    .replace("import { IPC } from '../ipc';", ipcModule);

  return ts.transpile(file, { removeComments: true, module: ts.ModuleKind.CommonJS }).replace(/[\n\r]/g, ' ');
}

const template = readFileSync(join(__dirname, '../src/preload/bundled.template.ts'), { encoding: 'utf8' });

writeFileSync(
  join(__dirname, '../src/preload/bundled.ts'),
  template
    .replace('{{hook-ipc.js}}', transpileFile('../src/preload/hook-ipc.ts'))
    .replace('{{start-native.js}}', transpileFile('../src/preload/start-native.ts')),
);
