import { app as appMain, BrowserWindow, crashReporter, ipcMain, ipcRenderer, remote, webContents } from 'electron';
const app = process.type === 'renderer' ? remote.app : appMain;
import * as path from 'path';
import * as RavenJs from 'raven-js';
import { Lazy } from './lazy';
import { defaults, IElectronSentryOptions } from './options';
// tslint:disable-next-line:no-var-requires
const Raven = require('raven');
// I couldn't get typings working here, but I didn't try that hard...

const dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+):(\w+)?@)?([\w\.-]+)(?::(\d+))?\/(.*)/;
const ipcKey: string = 'electron-sentry-stop-in-other-process';

export class ElectronSentry {
  private static singleton = new Lazy<ElectronSentry>(() => new ElectronSentry());

  private hookedStop: boolean;

  public static start(dsnOrOptions?: string | IElectronSentryOptions) {
    this.singleton.value.start(dsnOrOptions);
  }

  public static stop() {
    this.singleton.value.stop();
  }

  public start(dsnOrOptions?: string | IElectronSentryOptions): void {
    const options = this.getConfig(dsnOrOptions);

    // this will only happen once per instance
    if (!this.hookedStop) {
      this.listenForStopInOtherProcess();
    }

    if (process.type === 'renderer') {
      this.startSentryBrowser(options);
    } else {
      this.startSentryNode(options);
    }

    if (options.native) {
      this.startNative(options);
    }
  }

  public stop() {
    if (process.type === 'renderer') {
      this.stopSentryBrowser();
      ipcRenderer.send(ipcKey);
    } else {
      this.stopSentryNode();
      this.stopNative();
      for (const webCon of webContents.getAllWebContents()) {
        webCon.send(ipcKey);
      }
    }
  }

  private listenForStopInOtherProcess() {
    this.hookedStop = true;

    if (process.type === 'renderer') {
      ipcRenderer.on(ipcKey, () => {
        this.stopSentryBrowser();
      });
    } else {
      ipcMain.on(ipcKey, () => {
        this.stopSentryNode();
        this.stopNative();
      });
    }
  }

  private getConfig(dsnOrOptions?: string | IElectronSentryOptions): IElectronSentryOptions {
    let options = defaults;

    if (typeof dsnOrOptions === 'string') {
      options.dsn = dsnOrOptions;
    } else {
      options = { ...options, ...dsnOrOptions };
    }

    if (options.dsn == undefined) {
      const pkg = require(path.join(ElectronSentry.getAppPath(), 'package.json'));
      options.dsn = pkg.sentryDsn;
    }

    if (options.dsn == undefined) {
      throw Error('Sentry DSN not found');
    }

    return options;
  }

  private startNative(options: IElectronSentryOptions) {
    const match = options.dsn.match(dsnPattern);
    if (match) {
      const [full, proto, key, secret, site, nothing, project] = match;
      const minidumpEndpoint = `${proto}://${site}/api/${project}/minidump?sentry_key=${key}`;

      crashReporter.start({
        productName: options.appName,
        companyName: options.companyName,
        submitURL: minidumpEndpoint,
        uploadToServer: true,
        extra: options.tags
      });
    } else {
      throw Error('Could not parse Sentry DSN');
    }
  }

  private stopNative() {
    if (crashReporter.getUploadToServer()) {
      crashReporter.setUploadToServer(false);
    }
  }

  private startSentryNode(options: IElectronSentryOptions) {
    const os = require('os');

    Raven.disableConsoleAlerts();
    Raven.config(options.dsn, {
      release: options.release,
      environment: options.environment,
      autoBreadcrumbs: true,
      captureUnhandledRejections: true,
      maxBreadcrumbs: 100,
      tags: {
        arch: process.arch,
        platform: os.type() + ' ' + os.release(),
        ...options.tags
      }
    }).install();
  }

  private stopSentryNode() {
    Raven.config();
  }

  private startSentryBrowser(options: IElectronSentryOptions) {
    RavenJs.config(options.dsn, {
      release: options.release,
      environment: options.environment,
      allowSecretKey: true,
      tags: options.tags
    }).install();

    // we have to intercept every error report and remove the file url
    // from every path otherwise errors aren't grouped properly
    RavenJs.setDataCallback((data: any) => {
      ElectronSentry.normalizeData(data);
    });

    // Capture exceptions in Promises too
    window.addEventListener(`unhandledrejection`, (e: any) => {
      RavenJs.captureException(e.reason);
    });
  }

  private stopSentryBrowser() {
    RavenJs.config(undefined);
  }

  private static normalizeData(data: any) {
    if (data.culprit) {
      data.culprit = this.normalizeUrl(data.culprit);
    }

    // NOTE: if data.exception exists, exception.values and exception.values[0] are
    // apparently guaranteed to exist
    const stacktrace = data.stacktrace || data.exception && data.exception.values[0].stacktrace;
    if (stacktrace) {
      stacktrace.frames.forEach((frame: any) => {
        frame.filename = this.normalizeUrl(frame.filename);
      });
    }
  }

  // urls in stack traces need normalising so that they only have the app part of path
  private static normalizeUrl(url: string) {
    return url.replace(/^.*app\.asar/, '');
  }

  private static getAppPath() {
    // Require due to https://github.com/electron-userland/electron-forge/issues/346
    return app.getAppPath().replace(/^(.*)\\node_modules.*default_app\.asar$/, '$1');
  }
}
