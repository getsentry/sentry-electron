import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');

import { electronRendererStackParser } from '../../src/renderer/stack-parse';

should();
use(chaiAsPromised);

describe('Parse mixed renderer stack traces', () => {
  it('Electron v2', () => {
    const stack = `Error: ENOENT: no such file or directory, open '/does-not-exist'
    at Object.fs.openSync (fs.js:646:18)
    at Object.module.(anonymous function) [as openSync] (ELECTRON_ASAR.js:166:20)
    at fs.readFileSync (fs.js:551:33)
    at fs.readFileSync (ELECTRON_ASAR.js:538:29)
    at two (file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html:17:11)
    at one (file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html:24:9)
    at global.setTimeout (file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html:28:9)
    at sentryWrapped (/Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/node_modules/@sentry/browser/cjs/helpers.js:87:17)`;

    const frames = electronRendererStackParser(stack);

    expect(frames).to.eql([
      {
        filename:
          'file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html',
        function: 'global.setTimeout',
        in_app: true,
        lineno: 28,
        colno: 9,
      },
      {
        filename:
          'file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html',
        function: 'one',
        in_app: true,
        lineno: 24,
        colno: 9,
      },
      {
        filename:
          'file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html',
        function: 'two',
        in_app: true,
        lineno: 17,
        colno: 11,
      },
      {
        filename: 'ELECTRON_ASAR.js',
        function: 'fs.readFileSync',
        lineno: 538,
        colno: 29,
        in_app: false,
      },
      {
        filename: 'fs.js',
        function: 'fs.readFileSync',
        lineno: 551,
        colno: 33,
        in_app: false,
      },
      {
        filename: 'ELECTRON_ASAR.js',
        function: 'Object.module.(anonymous function) [as openSync]',
        lineno: 166,
        colno: 20,
        in_app: false,
      },
      {
        filename: 'fs.js',
        function: 'Object.fs.openSync',
        lineno: 646,
        colno: 18,
        in_app: false,
      },
    ]);
  });

  it('Electron v19', () => {
    const stack = `Error: ENOENT: no such file or directory, open '/does-not-exist'
    at Object.openSync (node:fs:585:3)
    at Object.func [as openSync] (node:electron/js2c/asar_bundle:5:1812)
    at readFileSync (node:fs:453:35)
    at e.readFileSync (node:electron/js2c/asar_bundle:5:9160)
    at two (file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html:17:11)
    at one (file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html:24:9)
    at file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html:28:9
    at sentryWrapped (/Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/node_modules/@sentry/browser/cjs/helpers.js:87:17)`;

    const frames = electronRendererStackParser(stack);

    expect(frames).to.eql([
      {
        filename:
          'file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html',
        function: '?',
        in_app: true,
        lineno: 28,
        colno: 9,
      },
      {
        filename:
          'file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html',
        function: 'one',
        in_app: true,
        lineno: 24,
        colno: 9,
      },
      {
        filename:
          'file:///Users/tim/Documents/Repositories/sentry-electron/test/e2e/dist/javascript-renderer/src/index.html',
        function: 'two',
        in_app: true,
        lineno: 17,
        colno: 11,
      },
      {
        filename: 'node:electron/js2c/asar_bundle',
        function: 'e.readFileSync',
        lineno: 5,
        colno: 9160,
        in_app: false,
      },
      {
        filename: 'node:fs',
        function: 'readFileSync',
        lineno: 453,
        colno: 35,
        in_app: false,
      },
      {
        filename: 'node:electron/js2c/asar_bundle',
        function: 'Object.func [as openSync]',
        lineno: 5,
        colno: 1812,
        in_app: false,
      },
      {
        filename: 'node:fs',
        function: 'Object.openSync',
        lineno: 585,
        colno: 3,
        in_app: false,
      },
    ]);
  });

  it('Electron localhost', () => {
    const stack = `Error: ENOENT: no such file or directory, open '/does-not-exist'
    at two (http://localhost:12345/src/index.html:17:11)
    at one (http://localhost:12345/src/index.html:24:9)`;

    const frames = electronRendererStackParser(stack);

    expect(frames).to.eql([
      {
        filename: 'http://localhost:12345/src/index.html',
        function: 'one',
        in_app: true,
        lineno: 24,
        colno: 9,
      },
      {
        filename: 'http://localhost:12345/src/index.html',
        function: 'two',
        in_app: true,
        lineno: 17,
        colno: 11,
      },
    ]);
  });
});
