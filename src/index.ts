throw new Error(`The Sentry Electron SDK uses different code for the main and renderer processes:

In the Electron main process you should import '@sentry/electron/main'
In the Electron renderer process you should import '@sentry/electron/renderer'

https://docs.sentry.io/platforms/javascript/guides/electron/#configure
`);

export {};
