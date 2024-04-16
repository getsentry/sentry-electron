import * as browser from '@sentry/browser';
import * as renderer from '../esm/renderer/index.js';

import * as node from '@sentry/node';

// We need to shim electron to avoid errors when importing the main process code into plain-old-node that doesn't have
// the electron module built-in.
import './electron-shim.mjs';

const main = await import('../esm/main/index.js');

const browserExports = Object.keys(browser);
const rendererExports = Object.keys(renderer);
const nodeExports = Object.keys(node);
const mainExports = Object.keys(main);

const ignoredBrowser = [
  'SDK_VERSION',
  'WINDOW',
  'Integrations',
  'close',
  'flush',
  'defaultStackLineParsers',
  // These wont ever be used
  'geckoStackLineParser',
  'opera10StackLineParser',
  'opera11StackLineParser',
  'winjsStackLineParser',
  // If you use the browser transports, just use the browser SDK
  'makeBrowserOfflineTransport',
  'makeFetchTransport',
  'makeMultiplexedTransport',
  'lazyLoadIntegration',
];

const ignoredNode = ['SDK_VERSION', 'makeNodeTransport', 'getSentryRelease'];

const missingRenderer = browserExports.filter((key) => !rendererExports.includes(key) && !ignoredBrowser.includes(key));
const missingMain = nodeExports.filter((key) => !mainExports.includes(key) && !ignoredNode.includes(key));

if (missingRenderer.length || missingMain.length) {
  if (missingRenderer.length) {
    console.error('Missing renderer exports:', missingRenderer);
  }

  if (missingMain.length) {
    console.error('Missing main exports:', missingMain);
  }

  process.exit(1);
}
