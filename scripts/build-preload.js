const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const ts = require('typescript');

function readFile(path) {
  return readFileSync(join(__dirname, path), { encoding: 'utf8' });
}

const ipcModule = readFile('../src/common/ipc.ts').replace('export', '');

function transpileFile(input, output, esm) {
  const module = esm ? ts.ModuleKind.ES2020 : ts.ModuleKind.CommonJS;

  // Because we're not using a proper bundler, we need to replace the import for ipc with inlined code
  const file = readFile(input).replace("import { IPC } from '../common/ipc';", ipcModule);
  const code = ts.transpile(file, { removeComments: true, module });
  const outPath = join(__dirname, output);
  try {
    mkdirSync(dirname(outPath), { recursive: true });
  } catch (_) {}
  writeFileSync(outPath, code);
}

// Output to ./preload so '@sentry/electron/preload' can be resolved
transpileFile('../src/preload/index.ts', '../preload/index.js', false);
transpileFile('../src/preload/legacy.ts', '../preload/legacy.js', false);

// The ESM output will never get used, but they need to be there for when webpack tries to
// find them due to `require.resolve('../../preload/index.js')` from esm/main code
transpileFile('../src/preload/index.ts', '../esm/preload/index.js', true);
transpileFile('../src/preload/legacy.ts', '../esm/preload/legacy.js', true);
