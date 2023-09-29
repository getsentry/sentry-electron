const { builtinModules } = require('module');
const { resolve } = require('path');

const typescript = require('@rollup/plugin-typescript');

const dependencies = Object.keys(require(resolve(process.cwd(), 'package.json')).dependencies || {});
const external = [...builtinModules, 'electron', ...dependencies];

const outputOptions = {
  sourcemap: true,
  strict: false,
  freeze: false,
  externalLiveBindings: false,
  generatedCode: {
    preset: 'es2015',
    symbols: false,
  },
};

function transpileFiles(format, input, outDir) {
  return {
    input,
    output: {
      ...outputOptions,
      format,
      dir: outDir,
      preserveModules: true,
    },
    treeshake: { moduleSideEffects: false },
    plugins: [
      typescript({
        outDir,
        tsconfig: './tsconfig.build.json',
      }),
    ],
    external,
  };
}

function bundlePreload(format, input, output) {
  return {
    input,
    output: {
      ...outputOptions,
      format,
      file: output,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.preload.json',
      }),
    ],
    external,
  };
}

module.exports = [
  transpileFiles('cjs', ['src/index.ts', 'src/main/index.ts', 'src/renderer/index.ts'], '.'),
  transpileFiles('esm', ['src/index.ts', 'src/main/index.ts', 'src/renderer/index.ts'], './esm'),
  bundlePreload('cjs', 'src/preload/index.ts', './preload/index.js'),
  bundlePreload('cjs', 'src/preload/legacy.ts', './preload/legacy.js'),
  bundlePreload('esm', 'src/preload/index.ts', './esm/preload/index.js'),
  bundlePreload('esm', 'src/preload/legacy.ts', './esm/preload/legacy.js'),
];
