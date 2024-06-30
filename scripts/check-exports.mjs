import * as browser from '@sentry/browser';
import * as node from '@sentry/node';

export default async function () {
  // We need to shim electron to avoid errors when importing the main process code into plain-old-node that doesn't have
  // the electron module built-in.
  await import('./electron-shim.mjs');

  const renderer = await import('../esm/renderer/index.js');
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
  // deprecated
  'captureUserFeedback',
];

const ignoredNode = [
  'SDK_VERSION',
  'makeNodeTransport',
  'getSentryRelease',
  // There's no way to use this in the main process
  'preloadOpenTelemetry',
  // We don't include these by default in the Electron SDK
  'getDefaultIntegrationsWithoutPerformance',
  'initWithoutDefaultIntegrations',
];

  const missingRenderer = browserExports.filter(
    (key) => !rendererExports.includes(key) && !ignoredBrowser.includes(key),
  );
  const missingMain = nodeExports.filter((key) => !mainExports.includes(key) && !ignoredNode.includes(key));

  if (missingRenderer.length || missingMain.length) {
    if (missingRenderer.length) {
      console.error('⚠️  Missing renderer exports ⚠️\n', missingRenderer);
    }

    if (missingMain.length) {
      console.error('⚠️  Missing main exports ⚠️\n', missingMain);
    }
  }
}
