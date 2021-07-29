const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const ts = require('typescript');

const ipc = readFileSync(join(__dirname, '../src/ipc.ts'), { encoding: 'utf8' });

function transpileFile(path) {
  let file = readFileSync(join(__dirname, path), { encoding: 'utf8' }).replace("import { IPC } from '../ipc';", ipc);
  return ts.transpile(file, { removeComments: true, module: ts.ModuleKind.CommonJS });
}

writeFileSync(
  join(__dirname, '../src/preload/bundled.ts'),
  `export const hookIPC = \`${transpileFile('../src/preload/hook-ipc.ts')}\`;

export const startNative = \`${transpileFile('../src/preload/start-native.ts')}\`;
`,
);
