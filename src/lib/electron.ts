import { platform, release, type } from 'os';

import { SentryBrowser, SentryBrowserOptions } from '@sentry/browser';
import {
  Adapter,
  Breadcrumb,
  Client,
  Context,
  Options,
  SentryEvent,
} from '@sentry/core';
import { SentryNode, SentryNodeOptions } from '@sentry/node';
import {
  app,
  crashReporter,
  ipcMain,
  ipcRenderer,
  powerMonitor,
  remote,
  screen,
  webContents,
} from 'electron';

import Store from './store';
import MinidumpUploader from './uploader';

/**
 * Maximum number of breadcrumbs that get added to an event. Can be overwritten
 * with `options.maxBreadcrumbs`.
 */
const MAX_BREADCRUMBS = 100;

/** IPC to send a captured event (exception or message) to Sentry */
const IPC_EVENT = 'sentry-electron.event';
/** IPC to capture a breadcrumb globally */
const IPC_CRUMB = 'sentry-electron.breadcrumbs';
/** IPC to capture new context (user, tags, extra) globally */
const IPC_CONTEXT = 'sentry-electron.context';

/** SDK name used in every event */
const SDK_NAME = 'sentry-electron';
/** SDK version used in every event */
const SDK_VERSION = require('../../package.json').version;

/**
 * Configuration options for `SentryElectron`.
 *
 * By default, all native crashes and JavaScript errors will be captured and
 * sent to Sentry. Note that these settings have to be specified during startup
 * and cannot be changed later.
 */
export interface SentryElectronOptions
  extends Options,
    SentryBrowserOptions,
    SentryNodeOptions {
  /**
   * Enables crash reporting for native crashes of this process (via Minidumps).
   * Defaults to `true`.
   */
  enableNative?: boolean;

  /**
   * Enables crash reporting for JavaScript errors in this process.
   * Defaults to `true`.
   */
  enableJavaScript?: boolean;
}

export class SentryElectron implements Adapter {
  private inner?: Adapter;
  private context: Store<Context> = new Store('context.json', {});
  private breadcrumbs: Store<Breadcrumb[]> = new Store('crumbs.json', []);
  private uploader: MinidumpUploader;

  constructor(
    private client: Client,
    public options: SentryElectronOptions = {},
  ) {}

  public async install(): Promise<boolean> {
    let success = true;

    if (this.isNativeEnabled()) {
      success = (await this.installNativeHandler()) && success;
    }

    if (this.isMainEnabled()) {
      success = (await this.installMainHandler()) && success;
    }

    if (this.isRenderEnabled()) {
      success = (await this.installRenderHandler()) && success;
    }

    if (this.isMainProcess()) {
      ipcMain.on(IPC_CRUMB, (_: Event, crumb: Breadcrumb) => {
        this.captureBreadcrumb(crumb).catch(e => this.client.log(e));
      });

      ipcMain.on(IPC_EVENT, (_: Event, event: SentryEvent) => {
        this.send(event).catch(e => this.client.log(e));
      });

      ipcMain.on(IPC_CONTEXT, (_: Event, context: Context) => {
        this.setContext(context).catch(e => this.client.log(e));
      });

      this.breadcrumbsFromEvents('app', app);

      app.on('ready', info => {
        // we can't access these until 'ready'
        this.breadcrumbsFromEvents('Screen', screen);
        this.breadcrumbsFromEvents('PowerMonitor', powerMonitor);
      });

      app.on('web-contents-created', (e, contents) => {
        this.breadcrumbsFromEvents(
          'WebContents',
          contents,
          'dom-ready',
          'load-url',
          'destroyed',
        );
      });
    }

    return success;
  }

  public captureException(exception: any): Promise<SentryEvent> {
    return this.callInner(inner => inner.captureException(exception));
  }

  public captureMessage(message: string): Promise<SentryEvent> {
    return this.callInner(inner => inner.captureMessage(message));
  }

  public async captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    if (this.isRenderProcess()) {
      ipcRenderer.send(IPC_CRUMB, breadcrumb);
      return breadcrumb;
    }

    const crumb = JSON.parse(JSON.stringify(breadcrumb));
    const max = this.options.maxBreadcrumbs || MAX_BREADCRUMBS;
    this.breadcrumbs.update(crumbs => [...crumbs.slice(-max), crumb]);

    return crumb;
  }

  public async send(event: SentryEvent): Promise<void> {
    if (this.isRenderProcess()) {
      ipcRenderer.send(IPC_EVENT, event);
      return;
    }

    const context = this.getEnrichedContext();
    const mergedEvent = {
      ...event,
      user: { ...context.user, ...event.user },
      tags: { ...context.tags, ...event.tags },
      extra: { ...context.extra, ...event.extra },
      sdk: { name: SDK_NAME, version: SDK_VERSION },
      breadcrumbs: this.breadcrumbs.get(),
    };

    return this.callInner(inner => inner.send(mergedEvent));
  }

  public async setOptions(options: SentryElectronOptions): Promise<void> {
    this.options = options;

    if (this.isNativeEnabled()) {
      // We can safely re-install the native CrashReporter. If it had been
      // started before, this will effectively be a no-op. Otherwise, it will
      // start a new instance.
      await this.installNativeHandler();
    } else {
      this.client.log('Native CrashReporter cannot be stopped once started.');
    }

    return this.callInner(inner => inner.setOptions(options));
  }

  public async getContext() {
    // The context is managed by the main process only
    return this.isMainProcess() ? this.context.get() : {};
  }

  public async setContext(context: Context): Promise<void> {
    if (this.isRenderProcess()) {
      ipcRenderer.send(IPC_CONTEXT, context);
      return;
    }

    this.context.set(context);
  }

  private isMainProcess(): boolean {
    return process.type === 'browser';
  }

  private isRenderProcess(): boolean {
    return process.type === 'renderer';
  }

  private isMainEnabled(): boolean {
    return this.isMainProcess() && this.options.enableJavaScript !== false;
  }

  private isRenderEnabled(): boolean {
    return this.isRenderProcess() && this.options.enableJavaScript !== false;
  }

  private isNativeEnabled(): boolean {
    // On macOS, we should only start the Electron CrashReporter in the main
    // process. It uses Crashpad internally, which will catch errors from all
    // sub processes thanks to out-of-processes crash handling. On other
    // platforms we need to start the CrashReporter in every sub process. For
    // more information see: https://goo.gl/nhqqwD
    if (platform() === 'darwin' && process.type !== 'browser') {
      return false;
    }

    return this.options.enableNative !== false;
  }

  private interceptBreadcrumb(crumb: Breadcrumb): boolean {
    const { shouldAddBreadcrumb } = this.options;
    if (!shouldAddBreadcrumb || shouldAddBreadcrumb(crumb)) {
      this.captureBreadcrumb(crumb);
    }

    return false;
  }

  private async sendNativeCrashes(): Promise<void> {
    const event = {
      ...this.getEnrichedContext(),
      release: this.options.release,
      environment: this.options.environment,
      sdk: { name: SDK_NAME, version: SDK_VERSION },
      breadcrumbs: this.breadcrumbs.get(),
    };

    const paths = await this.uploader.getNewMinidumps();
    await Promise.all(
      paths.map(path => this.uploader.uploadMinidump(path, event)),
    );
  }

  private async installNativeHandler(): Promise<boolean> {
    // We will manually submit errors, but CrashReporter requires a submitURL in
    // some versions. Also, provide a productName and companyName, which we will
    // add manually to the event's context during submission.
    crashReporter.start({
      productName: app.getName(),
      companyName: '',
      submitURL: '',
      uploadToServer: false,
      ignoreSystemCrashHandler: true,
    });

    if (this.isMainProcess()) {
      // The crashReporter has an undocumented method to retrieve the directory
      // it uses to store minidumps in. The structure in this directory depends
      // on the crash library being used (Crashpad or Breakpad).
      const crashesDirectory = (crashReporter as any).getCrashesDirectory();
      this.uploader = new MinidumpUploader(this.client.dsn, crashesDirectory);

      // Start to submit recent minidump crashes. This will load breadcrumbs
      // and context information that was cached on disk prior to the crash.
      this.sendNativeCrashes();

      // Every time a subprocess or renderer crashes, start sending minidumps
      // right away.
      app.on('web-contents-created', (event, contents) => {
        contents.on('crashed', () => {
          this.sendNativeCrashes();
        });
      });
    }

    return true;
  }

  private async installMainHandler(): Promise<boolean> {
    const options = {
      ...this.options,
      shouldAddBreadcrumb: this.interceptBreadcrumb.bind(this),
    };

    // Browser is the Electron main process (Node)
    const node = new SentryNode(this.client, options);
    if (!await node.install()) {
      return false;
    }

    this.inner = node;
    return true;
  }

  private async installRenderHandler(): Promise<boolean> {
    const options = {
      ...this.options,
      shouldAddBreadcrumb: this.interceptBreadcrumb.bind(this),
    };

    // Renderer is an Electron BrowserWindow, thus Chromium
    const browser = new SentryBrowser(this.client, options);
    if (!await browser.install()) {
      return false;
    }

    this.inner = browser;
    return true;
  }

  private async callInner<R>(
    callback: (inner: Adapter) => Promise<R>,
  ): Promise<R> {
    if (this.inner === undefined) {
      throw new Error('Please call install first');
    }

    return callback(this.inner);
  }

  private getEnrichedContext(): Context {
    const context = this.context.get();

    context.tags = {
      arch: process.arch,
      'os.name': type(),
      os: `${type()} ${release()}`,
      ...context.tags,
    };

    return context;
  }

  private breadcrumbsFromEvents(
    category: string,
    emitter: Electron.EventEmitter,
    ...include: string[]
  ) {
    const originalEmit = emitter.emit;
    // tslint:disable:only-arrow-functions
    // tslint:disable-next-line:space-before-function-paren
    emitter.emit = event => {
      // tslint:enable:only-arrow-functions
      if (include.length === 0 || include.indexOf(event) > -1) {
        this.captureBreadcrumb({
          message: `${category}.${event}`,
          type: `ui`,
          category: `electron`,
          timestamp: new Date().getTime() / 1000,
        });
      }
      return originalEmit.apply(emitter, arguments);
    };
  }
}
