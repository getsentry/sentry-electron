<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
<br/>
    <h1>Official Sentry SDK for Electron</h1>
</p>

[![Travis](https://img.shields.io/travis/getsentry/sentry-electron.svg?maxAge=2592000)](https://travis-ci.org/getsentry/sentry-electron)
[![AppVeyor](https://img.shields.io/appveyor/ci/sentry/sentry-electron.svg)](https://ci.appveyor.com/project/sentry/sentry-electron)

[![license](https://img.shields.io/github/license/getsentry/sentry-electron.svg)](https://github.com/getsentry/sentry-electron/blob/master/LICENSE)

[![npm version](https://img.shields.io/npm/v/@sentry/electron.svg)](https://www.npmjs.com/package/@sentry/electron)
[![npm dm](https://img.shields.io/npm/dm/@sentry/electron.svg)](https://www.npmjs.com/package/@sentry/electron)
[![npm dt](https://img.shields.io/npm/dt/@sentry/electron.svg)](https://www.npmjs.com/package/@sentry/electron)

[![deps](https://david-dm.org/getsentry/sentry-electron/status.svg)](https://david-dm.org/getsentry/sentry-electron?view=list)
[![deps dev](https://david-dm.org/getsentry/sentry-electron/dev-status.svg)](https://david-dm.org/getsentry/sentry-electron?type=dev&view=list)
[![deps peer](https://david-dm.org/getsentry/sentry-electron/peer-status.svg)](https://david-dm.org/getsentry/sentry-electron?type=peer&view=list)

## Usage

Add this to your `renderer` and `main` process js files:

```javascript
const Sentry = require('@sentry/core');
const SentryElectron = require('@sentry/electron');

Sentry.create('___DSN___')
  .use(SentryElectron)
  .install();
```

## Documentation

* [Installation](https://docs.sentry.io/clients/javascript/integrations/electron/#installation)
* [Documentation](https://docs.sentry.io/clients/javascript/integrations/electron/)
