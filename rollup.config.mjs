import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import typescript from '@rollup/plugin-typescript';

const pkgJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json')));
const dependencies = Object.keys(pkgJson.dependencies || {});
const peerDependencies = Object.keys(pkgJson.peerDependencies || {});
const external = [...builtinModules, /^node:/, 'electron', ...dependencies, ...peerDependencies];

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

// a simple plugin that adds a package.json file with type: module
const modulePackageJson = {
  name: 'package-json-module-type',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'package.json',
      source: '{"type": "module"}',
    });
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
      format === 'esm' ? modulePackageJson : {},
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

const entryPoints = [
  'src/index.ts',
  'src/main/index.ts',
  'src/renderer/index.ts',
  'src/utility/index.ts',
  'src/native/index.ts',
  'src/preload/index.ts',
];

export default [
  transpileFiles('cjs', entryPoints, '.'),
  transpileFiles('esm', entryPoints, './esm'),
  bundlePreload('cjs', 'src/preload/default.ts', './preload/default.js'),
  bundlePreload('esm', 'src/preload/default.ts', './esm/preload/default.js'),
];
