import { platform, release, type } from 'os';
import { join } from 'path';

import { SentryBrowser, SentryBrowserOptions } from '@sentry/browser';
import {
  Adapter,
  Breadcrumb,
  Client,
  Context,
  Options,
  SentryError,
  SentryEvent,
} from '@sentry/core';
import { SentryNode, SentryNodeOptions, Store } from '@sentry/node';
import {
  app,
  crashReporter,
  ipcMain,
  ipcRenderer,
  powerMonitor,
  remote,
  screen,
} from 'electron';

import { normalizeEvent, normalizeUrl } from './normalize';
import { MinidumpUploader } from './uploader';
import { clone, getApp, isMainProcess, isRenderProcess } from './utils';

/**
 * Maximum number of breadcrumbs that get added to an event. Can be overwritten
 * with `options.maxBreadcrumbs`.
 */
const MAX_BREADCRUMBS = 100;

/** IPC to send a captured event (exception or message) to Sentry. */
const IPC_EVENT = 'sentry-electron.event';
/** IPC to capture a breadcrumb globally. */
const IPC_CRUMB = 'sentry-electron.breadcrumbs';
/** IPC to capture new context (user, tags, extra) globally. */
const IPC_CONTEXT = 'sentry-electron.context';

/** SDK name used in every event. */
const SDK_NAME = 'sentry-electron';
/** SDK version used in every event. */
// tslint:disable-next-line
const SDK_VERSION = require('../../package.json').version;

/** App-specific directory to store information in. */
export const CACHE_PATH = join(getApp().getPath('userData'), 'sentry');

/** Patch to access internal CrashReporter functionality. */
interface CrashReporterExt {
  getCrashesDirectory(): string;
}

/** Patch to access internal Raven functionality. */
interface RavenExt {
  onFatalError(error: Error): void;
}

/**
 * Configuration options for {@link SentryElectron}.
 *
 * By default, all native crashes and JavaScript errors will be captured and
 * sent to Sentry. Note that these settings have to be specified during startup
 * and cannot be changed later.
 *
 * This options object can also contain options for the Browser and Node SDKs,
 * which are being used under the hood to record JavaScript errors. Please refer
 * to their documentation for a description of the fields.
 *
 * @see SentryBrowserOptions
 * @see SentryNodeOptions
 * @see SentryElectron
 */
export interface SentryElectronOptions
  extends Options,
    SentryBrowserOptions,
    SentryNodeOptions {
  /**
   * Enables crash reporting for JavaScript errors in this process.
   * Defaults to `true`.
   */
  enableJavaScript?: boolean;

  /**
   * Enables crash reporting for native crashes of this process (via Minidumps).
   * Defaults to `true`.
   */
  enableNative?: boolean;

  /**
   * This will be called in case of a non recoverable fatal error.
   */
  onFatalError?(error: Error): void;
}

/**
 * Official Sentry SDK for Electron.
 *
 * This adapter hooks into Electron, records breadcrumbs for common events and
 * collect native crashes and JavaScript errors. The SDK can be initialized
 * in the main processes, renderer processes and spawned child processes.
 *
 * Note that the call to {@link Sentry.Client.install} should occur as early as
 * possible so that even errors during startup can be recorded reliably. This
 * also applies to renderer processes.
 *
 * See {@link SentryElectronOptions} for configuration options.
 *
 * @example
 * const Sentry = require('@sentry/core');
 * const { SentryElectron } = require('@sentry/electron');
 *
 * const options = {
 *   enableNative: true,
 *   enableJavaScript: true,
 * };
 *
 * Sentry.create(__DSN__)
 *   .use(SentryElectron, options)
 *   .install();
 *
 * @see SentryElectronOptions
 * @see Sentry.Client
 */
export class SentryElectron implements Adapter {
  /** Store to persist breadcrumbs beyond application crashes. */
  private readonly breadcrumbs: Store<Breadcrumb[]> = new Store<Breadcrumb[]>(
    CACHE_PATH,
    'breadcrumbs',
    [],
  );

  /** Store to persist context information beyond application crashes. */
  private readonly context: Store<Context> = new Store<Context>(
    CACHE_PATH,
    'context',
    {},
  );

  /** The inner SDK used to record JavaScript events. */
  private inner?: SentryBrowser | SentryNode;

  /** Uploader for minidump files. */
  private uploader?: MinidumpUploader;

  /**
   * Creates a new instance of the
   * @param client The Sentry SDK Client.
   * @param options Options to configure the Electron SDK.
   */
  public constructor(
    private readonly client: Client,
    public options: SentryElectronOptions = {},
  ) {}

  /**
   * Initializes the SDK.
   *
   * This function installs all internal error handlers and hooks into Electron.
   * It will be called automatically by the Sentry Client.
   */
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

    if (isMainProcess()) {
      ipcMain.on(IPC_CRUMB, (_: Event, crumb: Breadcrumb) => {
        this.captureBreadcrumb(crumb).catch(e => {
          this.client.log(e);
        });
      });

      ipcMain.on(IPC_EVENT, (_: Event, event: SentryEvent) => {
        this.send(event).catch(e => {
          this.client.log(e);
        });
      });

      ipcMain.on(IPC_CONTEXT, (_: Event, context: Context) => {
        this.setContext(context).catch(e => {
          this.client.log(e);
        });
      });

      this.instrumentBreadcrumbs('app', app);

      app.on('ready', () => {
        // We can't access these until 'ready'
        this.instrumentBreadcrumbs('Screen', screen);
        this.instrumentBreadcrumbs('PowerMonitor', powerMonitor);
      });

      app.on('web-contents-created', (_, contents) => {
        // SetImmediate is required for contents.id to be correct
        // https://github.com/electron/electron/issues/12036
        setImmediate(() => {
          this.instrumentBreadcrumbs(`WebContents[${contents.id}]`, contents, [
            'dom-ready',
            'load-url',
            'destroyed',
          ]);
        });
      });
    }

    return success;
  }

  /**
   * Generates a Sentry event from an exception.
   *
   * @param exception An error-like object or error message to capture.
   * @returns An event to be sent to Sentry.
   */
  public async captureException(exception: any): Promise<SentryEvent> {
    return this.callInner(async inner => inner.captureException(exception));
  }

  /**
   * Generates a Sentry event from a plain message.
   *
   * @param exception A message to capture as Sentry event.
   * @returns An event to be sent to Sentry.
   */
  public async captureMessage(message: string): Promise<SentryEvent> {
    return this.callInner(async inner => inner.captureMessage(message));
  }

  /**
   * Records a breadcrumb which will be included in subsequent events.
   *
   * Use {@link Options.maxBreadcrumbs} to control the maximum number of
   * breadcrumbs that will be included in an event.
   *
   * @param breadcrumb Partial breadcrumb data.
   * @returns The recorded breadcrumb.
   */
  public async captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_CRUMB, breadcrumb);
      return breadcrumb;
    }

    const crumb = clone(breadcrumb);
    const { maxBreadcrumbs: max = MAX_BREADCRUMBS } = this.options;
    this.breadcrumbs.update(crumbs => [...crumbs.slice(-max), crumb]);

    return crumb;
  }

  /**
   * Sends an event to Sentry.
   *
   * In renderer processes, this will send an IPC message to the main process.
   * The main processes adds context, breadcrumbs, as well as device and SDK
   * information and then sends the event to Sentry.
   *
   * @param event An event to be sent to Sentry.
   * @returns A promise that resolves when the event has been sent.
   */
  public async send(event: SentryEvent): Promise<void> {
    if (isRenderProcess()) {
      const contents = remote.getCurrentWebContents();
      event.extra = {
        ...event.extra,
        crashed_process: `renderer[${contents.id}]`,
      };

      ipcRenderer.send(IPC_EVENT, event);
      return;
    }

    const context = this.getEnrichedContext();
    const mergedEvent = {
      ...normalizeEvent(event),
      breadcrumbs: this.breadcrumbs.get(),
      extra: { crashed_process: 'browser', ...context.extra, ...event.extra },
      sdk: { name: SDK_NAME, version: SDK_VERSION },
      tags: { ...context.tags, ...event.tags },
      user: { ...context.user, ...event.user },
    };

    return this.callInner(async inner => inner.send(mergedEvent));
  }

  /**
   * Updates options of this SDK.
   *
   * Note that once crash reporting is enabled for either JavaScript errors or
   * native crashes, they cannot be disabled anymore.
   *
   * @param options New options.
   */
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

    return this.callInner(async inner => inner.setOptions(options));
  }

  /**
   * Returns the context saved for this app.
   *
   * After a native crash, this tries to recover saved context from disk. Use
   * {@link setContext} to change this context. Note that the context is managed
   * by the main process, so calling this method in the renderer process will
   * not return any data.
   *
   * @returns The current context.
   */
  public async getContext(): Promise<Context> {
    // The context is managed by the main process only
    return isMainProcess() ? this.context.get() : {};
  }

  /**
   * Sets a new context for this app.
   *
   * The context is managed by the main process. Calling this method in a
   * renderer process will issue an IPC message to the main process. The context
   * is asynchronously flushed to disk so that it can be recovered when the
   * application crashes.
   *
   * @param context A new context to replace the previous one.
   */
  public async setContext(context: Context): Promise<void> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_CONTEXT, context);
      return;
    }

    this.context.set(context);
  }

  /** Clears the breadcrumb store */
  public clearBreadcrumbs(): void {
    this.breadcrumbs.clear();
  }

  /** Returns whether JS is enabled and we are in the main process. */
  private isMainEnabled(): boolean {
    return isMainProcess() && this.options.enableJavaScript !== false;
  }

  /** Returns whether JS is enabled and we are in a renderer process. */
  private isRenderEnabled(): boolean {
    return isRenderProcess() && this.options.enableJavaScript !== false;
  }

  /** Returns whether native reports are enabled. */
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

  /** Intercepts breadcrumbs from other SDKs. */
  private interceptBreadcrumb(crumb: Breadcrumb): boolean {
    const { shouldAddBreadcrumb } = this.options;
    if (!shouldAddBreadcrumb || shouldAddBreadcrumb(crumb)) {
      this.captureBreadcrumb(crumb).catch(e => {
        this.client.log(e);
      });
    }

    // We do not want the Node and Browser SDK to record breadcrumbs directly.
    // Instead, we will manage them and append them to the events manually.
    return false;
  }

  /** Loads new native crashes from disk and sends them to Sentry. */
  private async sendNativeCrashes(extra: object): Promise<void> {
    // Whenever we are called, assume that the crashes we are going to load down
    // below have occurred recently. This means, we can use the same event data
    // for all minidumps that we load now. There are two conditions:
    //
    //  1. The application crashed and we are just starting up. The stored
    //     breadcrumbs and context reflect the state during the application
    //     crash.
    //
    //  2. A renderer process crashed recently and we have just been notified
    //     about it. Just use the breadcrumbs and context information we have
    //     right now and hope that the delay was not too long.

    const uploader = this.uploader;
    if (uploader === undefined) {
      throw new SentryError('Invariant violation: Native crashes not enabled');
    }

    const context = this.getEnrichedContext();
    const event = {
      // Breadcrumbs are copied as they may get cleared at startup
      breadcrumbs: Array.from(this.breadcrumbs.get()),
      environment: this.options.environment,
      extra: { ...context.extra, ...extra },
      release: this.options.release,
      sdk: { name: SDK_NAME, version: SDK_VERSION },
      tags: context.tags,
      user: context.user,
    };

    const paths = await uploader.getNewMinidumps();
    await Promise.all(
      paths.map(async path => uploader.uploadMinidump({ path, event })),
    );
  }

  /** Activates the Electron CrashReporter. */
  private async installNativeHandler(): Promise<boolean> {
    // We will manually submit errors, but CrashReporter requires a submitURL in
    // some versions. Also, provide a productName and companyName, which we will
    // add manually to the event's context during submission.
    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: getApp().getName(),
      submitURL: '',
      uploadToServer: false,
    });

    if (isMainProcess()) {
      // The crashReporter has an undocumented method to retrieve the directory
      // it uses to store minidumps in. The structure in this directory depends
      // on the crash library being used (Crashpad or Breakpad).
      const reporter: CrashReporterExt = crashReporter as any;
      const crashesDirectory = reporter.getCrashesDirectory();

      this.uploader = new MinidumpUploader(
        this.client.dsn,
        crashesDirectory,
        CACHE_PATH,
      );

      // Flush already cached minidumps from the queue.
      this.uploader.flushQueue().catch(e => {
        this.client.log(e);
      });

      // Start to submit recent minidump crashes. This will load breadcrumbs
      // and context information that was cached on disk prior to the crash.
      this.sendNativeCrashes({
        crashed_process: 'browser',
      }).catch(e => {
        this.client.log(e);
      });

      // Every time a subprocess or renderer crashes, start sending minidumps
      // right away.
      app.on('web-contents-created', (_, contents) => {
        contents.on('crashed', async () =>
          this.sendNativeCrashes({
            crashed_process: `renderer[${contents.id}]`,
            crashed_url: normalizeUrl(contents.getURL()),
          }).catch(e => {
            this.client.log(e);
          }),
        );
      });
    }

    return true;
  }

  /** Activates the Node SDK for the main process. */
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

    const raven = node.getRaven() as RavenExt;
    if (this.options.onFatalError) {
      raven.onFatalError = this.options.onFatalError;
    } else {
      raven.onFatalError = (error: Error) => {
        console.error('*********************************');
        console.error('* SentryElectron unhandledError *');
        console.error('*********************************');
        console.error(error);
        console.error('---------------------------------');
      };
    }

    this.inner = node;
    return true;
  }

  /** Activates the Browser SDK for the renderer process. */
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

  /**
   * Helper to call a method on the inner SDK (Browser or Node). It will error
   * if JavaScript reporting is turned off.
   */
  private async callInner<R>(
    callback: (inner: Adapter) => Promise<R>,
  ): Promise<R> {
    if (this.inner === undefined) {
      throw new SentryError(
        'Invariant violation: Call .install() before using other methods',
      );
    }

    return callback(this.inner);
  }

  /** Returns a context enriched by device and OS information. */
  private getEnrichedContext(): Context {
    const context = this.context.get();

    context.tags = {
      arch: process.arch,
      os: `${type()} ${release()}`,
      'os.name': type(),
      ...context.tags,
    };

    return context;
  }

  /**
   * Hooks into the Electron EventEmitter to capture breadcrumbs for the
   * specified events.
   */
  private instrumentBreadcrumbs(
    category: string,
    emitter: Electron.EventEmitter,
    events: string[] = [],
  ): void {
    type Emit = (event: string, ...args: any[]) => boolean;
    const emit = emitter.emit.bind(emitter) as Emit;

    emitter.emit = (event, ...args) => {
      if (events.length === 0 || events.indexOf(event) > -1) {
        const breadcrumb = {
          category: 'electron',
          message: `${category}.${event}`,
          timestamp: new Date().getTime() / 1000,
          type: 'ui',
        };

        this.captureBreadcrumb(breadcrumb).catch(e => {
          this.client.log(e);
        });
      }

      return emit(event, ...args);
    };
  }
}
