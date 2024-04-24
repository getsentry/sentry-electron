throw new Error(`The Sentry Electron SDK uses different code for the main and renderer processes:

In the Electron main process you should import '@sentry/electron/main'
In the Electron renderer process you should import '@sentry/electron/renderer'

https://github.com/getsentry/sentry-electron/blob/master/MIGRATION.md#initializing-the-sdk-in-v5
`);

export {};
