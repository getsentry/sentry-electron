import { app as appMain, BrowserWindow, crashReporter, ipcMain, ipcRenderer, remote, webContents } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Raven from 'raven';
import * as RavenJs from 'raven-js';
import { Lazy } from './lazy';
import { defaults, IElectronSentryOptions } from './options';
// tslint:disable-next-line:no-var-requires
// const Raven = require('raven');
// I couldn't get typings working here, but I didn't try that hard...
const app = process.type === 'renderer' ? remote.app : appMain;

const dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+):(\w+)?@)?([\w\.-]+)(?::(\d+))?\/(.*)/;

export class ElectronSentry {
  private static singleton = new Lazy<ElectronSentry>(() => new ElectronSentry());
  private static enabledFilePath = new Lazy<string>(() =>
    path.join(app.getPath('userData'), 'electron-sentry.enabled'));

  public static start(dsnOrOptions?: string | IElectronSentryOptions) {
    this.singleton.value.start(dsnOrOptions);
  }

  public static isEnabled(): boolean {
    return fs.existsSync(this.enabledFilePath.value);
  }

  public static setEnabled(uploadToServer: boolean) {
    if (fs.existsSync(this.enabledFilePath.value)) {
      if (!uploadToServer) {
        fs.unlinkSync(this.enabledFilePath.value);
      }
    } else if (uploadToServer) {
      fs.writeFileSync(this.enabledFilePath.value, '');
    }
  }

  public static captureException(e: Error) {
    if (process.type === 'renderer') {
      RavenJs.captureException(e);
    } else {
      Raven.captureException(e);
    }
  }

  public static captureMessage(e: string) {
    if (process.type === 'renderer') {
      RavenJs.captureMessage(e);
    } else {
      Raven.captureMessage(e);
    }
  }

  public start(dsnOrOptions?: string | IElectronSentryOptions): void {
    if (dsnOrOptions == undefined) {
      const pkg = require(path.join(app.getAppPath(), 'package.json'));
      dsnOrOptions = pkg.sentry;
    }

    const options = typeof dsnOrOptions === 'string'
      ? { ...defaults, dsn: dsnOrOptions }
      : { ...defaults, ...dsnOrOptions };

    if (options.dsn == undefined) {
      throw Error('Sentry DSN not found');
    }

    if (process.type === 'renderer') {
      this.startJavaScript(options);
    } else {
      this.startNode(options);
    }

    if (options.native) {
      this.startNative(options);
    }
  }

  private startJavaScript(options: IElectronSentryOptions) {
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

  private startNode(options: IElectronSentryOptions) {
    Raven.disableConsoleAlerts();
    Raven.config(options.dsn, {
      release: options.release,
      environment: options.environment,
      autoBreadcrumbs: true,
      captureUnhandledRejections: true,
      tags: {
        arch: process.arch,
        platform: os.type() + ' ' + os.release(),
        ...options.tags
      }
    }).install();
  }

  private startNative(options: IElectronSentryOptions) {
    const match = options.dsn.match(dsnPattern);
    if (match) {
      const [full, proto, key, secret, site, nothing, project] = match;
      const minidumpEndpoint = `${proto}://${site}/api/${project}/minidump?sentry_key=${key}`;

      const extra: { [key: string]: string } = {};
      extra['sentry[release]'] = options.release;
      extra['sentry[environment]'] = options.environment;
      extra['sentry[arch]'] = process.arch;

      if (options.tags instanceof Object) {
        for (const each of Object.keys(options.tags)) {
          if (!(options.tags[each] instanceof Object)) {
            extra[`sentry[tags][${each}]`] = options.tags[each];
          }
        }
      }

      crashReporter.start({
        productName: options.appName,
        companyName: options.companyName,
        submitURL: minidumpEndpoint,
        uploadToServer: true,
        extra: extra
      });
    } else {
      throw Error('Could not parse Sentry DSN');
    }
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
}
