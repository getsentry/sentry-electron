const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { transpile } = require('typescript');

const files = ['hook-ipc', 'start-native'];

function readString(path) {
  return readFileSync(join(__dirname, path), { encoding: 'utf8' });
}

const ipcModule = readString('../src/ipc.ts');

function transpileFile(path) {
  // Since we're not doing proper bundling we need to replace the ipc import with the code 😋
  let file = readString(path).replace("import { IPC } from '../ipc';", ipcModule);

  return transpile(file, { removeComments: true });
}

const template = readString('../src/preload/bundled.template.ts');

// Replace all the keys in the template with transpiled code
const code = files.reduce(
  (tpl, file) => tpl.replace(`{{${file}}}`, transpileFile(`../src/preload/${file}.ts`)),
  template,
);

writeFileSync(join(__dirname, '../src/preload/bundled.ts'), code);
