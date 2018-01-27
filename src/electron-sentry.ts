import { app as appMain, BrowserWindow, crashReporter, ipcMain, ipcRenderer, powerMonitor, remote, screen, webContents } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Raven from 'raven';
import * as RavenJs from 'raven-js';
import { Lazy } from './lazy';
import { defaults, IElectronSentryOptions } from './options';
const app = process.type === 'renderer' ? remote.app : appMain;

const dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+):(\w+)?@)?([\w\.-]+)(?::(\d+))?\/(.*)/;
const breadcrumbsFromRenderer = 'sentry-electron.breadcrumbs-from-renderer';
const exceptionsFromRenderer = 'sentry-electron.exceptions-from-renderer';

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

  private nativeCrashCount = 0;

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
      tags: options.tags,
      breadcrumbCallback: crumb => {
        // we record breadcrumbs in the main process
        ipcRenderer.send(breadcrumbsFromRenderer, crumb);
        return false;
      },
      shouldSendCallback: data => {
        // we record exceptions in the main process
        ipcRenderer.send(exceptionsFromRenderer, data);
        return false;
      }
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
    // tslint:disable-next-line:no-object-literal-type-assertion
    Raven.config(options.dsn, {
      release: options.release,
      environment: options.environment,
      autoBreadcrumbs: {
        'console': true,
        'http': false,
      },
      captureUnhandledRejections: true,
      maxBreadcrumbs: 100,
      dataCallback: (data) => {
        // delete the machine name
        delete data.server_name;
        return data;
      },
      tags: {
        arch: process.arch,
        'os.name': os.type(),
        os: os.type() + ' ' + os.release(),
        ...options.tags
      }
    } as Raven.ConstructorOptions).install();

    // Track breadcrumbs from renderers
    ipcMain.on(breadcrumbsFromRenderer, (event: Event, crumb: any) => {
      Raven.captureBreadcrumb(crumb);
    });

    // Exceptions from the renderer
    ipcMain.on(exceptionsFromRenderer, (event: Event, data: any) => {
      // add the breadcrumbs from the main process and send
      data.breadcrumbs = Raven.getContext().breadcrumbs;
      (Raven as any).send(data);
    });

    this.breadcrumbsFromEvents('app', app);
    // ipcMain.emit is very noisy and doesn't look that useful
    // this.interceptEvents('ipcMain', ipcMain, 'ELECTRON_BROWSER_MEMBER_CALL');

    app.on('ready', info => {
      // we can't access these until 'ready'
      this.breadcrumbsFromEvents('Screen', screen);
      this.breadcrumbsFromEvents('PowerMonitor', powerMonitor);
    });

    app.on('browser-window-created', (e, window) => {
      this.breadcrumbsFromEvents('BrowserWindow', window);
    });

    app.on('web-contents-created', (e, contents) => {
      this.breadcrumbsFromEvents('WebContents', contents, 'dom-ready', 'load-url', 'destroyed');

      contents.on('crashed', (event, killed) => {
        this.reportNativeCrashWithId();
        // Without offline support the only way we can ensure native crash is sent is to
        // reload the webContents. This is a good idea anyway since a crashed white frameless
        // window looks bad. This leaves the possibility of an infinite crash loop so we
        // bail out after a few
        this.nativeCrashCount++;
        if (this.nativeCrashCount < 4) {
          contents.reload();
        } else {
          const window = BrowserWindow.fromWebContents(contents);
          window.destroy();
        }
      });
    });
  }

  private reportNativeCrashWithId(attempt = 0) {
    if (attempt > 4) {
      return;
    }
    // Due to this bug we cannot rely on getLastCrashReport returning the latest
    // https://github.com/electron/electron/issues/11749
    // We also have to ensure the crash is recent. If its sill sending we could get previous crash
    const report = this.getLatestReport(10);
    if (report) {
      ElectronSentry.captureMessage(`Renderer Native Crash: ${report.id}`);
    } else {
      setTimeout(() => {
        this.reportNativeCrashWithId(attempt + 1);
      }, 1000);
    }
  }

  private getLatestReport(withinLastSeconds: number): { date: Date, id: string } {
    // We have to coerce the types a little due to incorrect type definitions
    // https://github.com/electron/electron/pull/11747
    const reports: { date: Date, id: string }[] = crashReporter.getUploadedReports() as any;
    const latest = reports.length > 0 ? reports[reports.length - 1] : undefined;

    return (latest.date.getTime() > (Date.now() - (withinLastSeconds * 1000))) ? latest : undefined;
  }

  private breadcrumbsFromEvents(category: string, emitter: Electron.EventEmitter, ...include: string[]) {
    const originalEmit = emitter.emit;
    // tslint:disable:only-arrow-functions
    // tslint:disable-next-line:space-before-function-paren
    emitter.emit = function (event) {
      // tslint:enable:only-arrow-functions
      if (include.length === 0 || include.indexOf(event) > -1) {
        Raven.captureBreadcrumb({
          message: `${category}.${event}`,
          category: `electron`
        });
      }
      return originalEmit.apply(emitter, arguments);
    };
  }

  private startNative(options: IElectronSentryOptions) {
    const match = options.dsn.match(dsnPattern);
    if (!match) {
      throw Error('Could not parse Sentry DSN');
    }

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
