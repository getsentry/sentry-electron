import { platform, release, type } from 'os';

import {
  app,
  crashReporter,
  ipcMain,
  powerMonitor,
  screen,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';

import { BrowserBackend, BrowserOptions } from '@sentry/browser';
import { Backend, Frontend, Options, SentryError } from '@sentry/core';
import { NodeBackend, NodeOptions } from '@sentry/node';
import {
  addBreadcrumb,
  Breadcrumb,
  captureEvent,
  Context,
  SentryEvent,
  setExtraContext,
  setTagsContext,
  setUserContext,
} from '@sentry/shim';
import { forget, Store } from '@sentry/utils';

import { ElectronFrontend } from './frontend';
import { IPC_CONTEXT, IPC_CRUMB, IPC_EVENT } from './ipc';
import { normalizeEvent, normalizeUrl } from './normalize';
import { captureMinidump } from './sdk';
import { MinidumpUploader } from './uploader';
import { getApp, getCachePath, isMainProcess, isRenderProcess } from './utils';

/** Base context used in all events. */
const DEFAULT_CONTEXT: Context = {
  tags: {
    arch: process.arch,
    os: `${type()} ${release()}`,
    'os.name': type(),
  },
};

/** Patch to access internal CrashReporter functionality. */
interface CrashReporterExt {
  getCrashesDirectory(): string;
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
export interface ElectronOptions extends Options, BrowserOptions, NodeOptions {
  /**
   * Enables crash reporting for JavaScript errors in this process. Defaults to
   * `true`.
   */
  enableJavaScript?: boolean;

  /**
   * Enables crash reporting for native crashes of this process (via Minidumps).
   * Defaults to `true`.
   */
  enableNative?: boolean;
}

/** The Sentry Electron SDK Backend. */
export class ElectronBackend implements Backend {
  /** Handle to the SDK frontend for callbacks. */
  private readonly frontend: ElectronFrontend;

  /** The inner SDK used to record JavaScript events. */
  private inner?: BrowserBackend | NodeBackend;

  /** Uploader for minidump files. */
  private uploader?: MinidumpUploader;

  /** Store to persist breadcrumbs beyond application crashes. */
  private breadcrumbs?: Store<Breadcrumb[]>;

  /** Store to persist context information beyond application crashes. */
  private context?: Store<Context>;

  /** Creates a new Electron backend instance. */
  public constructor(frontend: Frontend<ElectronOptions>) {
    // TODO: For now, we need ElectronFrontend.captureMinidump to upload
    // minidump files with event data. We should figure out a better way to
    // avoid this unsafe cast.
    this.frontend = frontend as ElectronFrontend;
  }

  /**
   * @inheritDoc
   */
  public install(): boolean {
    let success = true;

    if (this.isNativeEnabled()) {
      success = this.installNativeHandler() && success;
    }

    if (this.isMainEnabled()) {
      success = this.installMainHandler() && success;
    }

    if (this.isRenderEnabled()) {
      success = this.installRenderHandler() && success;
    }

    if (isMainProcess()) {
      this.breadcrumbs = new Store<Breadcrumb[]>(
        getCachePath(),
        'breadcrumbs',
        [],
      );
      this.context = new Store<Context>(
        getCachePath(),
        'context',
        DEFAULT_CONTEXT,
      );

      this.installIPC();
      this.installAutoBreadcrumbs();
    }

    return success;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any): Promise<SentryEvent> {
    return this.callInner(async inner => inner.eventFromException(exception));
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string): Promise<SentryEvent> {
    return this.callInner(async inner => inner.eventFromMessage(message));
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<number> {
    if (isRenderProcess()) {
      throw new SentryError('Invariant violation: Should not happen');
    } else {
      const mergedEvent = {
        ...normalizeEvent(event),
        extra: { crashed_process: 'browser', ...event.extra },
      };

      return this.callInner(async inner => inner.sendEvent(mergedEvent));
    }
  }

  /**
   * Uploads the given minidump and attaches event information.
   *
   * @param path A relative or absolute path to the minidump file.
   * @param event Optional event information to add to the minidump request.
   * @returns A promise that resolves to the status code of the request.
   */
  public async uploadMinidump(
    path: string,
    event: SentryEvent = {},
  ): Promise<number> {
    if (this.uploader) {
      await this.uploader.uploadMinidump({ path, event });
    }
    return 200;
  }

  /** Returns the full list of breadcrumbs (or empty). */
  public loadBreadcrumbs(): Breadcrumb[] {
    return this.breadcrumbs ? this.breadcrumbs.get() : [];
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(breadcrumb: Breadcrumb): boolean {
    if (!this.breadcrumbs) {
      throw new SentryError(
        'Invariant violation: Should be called in the main process',
      );
    }

    // We replicate the behavior of the frontend
    const { maxBreadcrumbs = 100 } = this.frontend.getOptions();
    this.breadcrumbs.update(breadcrumbs =>
      [...breadcrumbs, breadcrumb].slice(-maxBreadcrumbs),
    );

    // Still, the frontend should merge breadcrumbs into events, for now
    return true;
  }

  /** Returns the latest context (or empty). */
  public loadContext(): Context {
    return this.context ? this.context.get() : {};
  }

  /**
   * @inheritDoc
   */
  public storeContext(nextContext: Context): boolean {
    if (!this.context) {
      throw new SentryError(
        'Invariant violation: Should be called in the main process',
      );
    }

    // We replicate the behavior of the frontend
    this.context.update(context => {
      if (nextContext.extra) {
        context.extra = { ...context.extra, ...nextContext.extra };
      }
      if (nextContext.tags) {
        context.tags = { ...context.tags, ...nextContext.tags };
      }
      if (nextContext.user) {
        context.user = { ...context.user, ...nextContext.user };
      }

      return context;
    });

    // Still, the frontend should merge context into events, for now
    return true;
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

    const event: SentryEvent = { extra };
    const paths = await uploader.getNewMinidumps();
    paths.map(path => {
      captureMinidump(path, event);
    });
  }

  /** Returns whether JS is enabled and we are in the main process. */
  private isMainEnabled(): boolean {
    const { enableJavaScript } = this.frontend.getOptions();
    return isMainProcess() && enableJavaScript !== false;
  }

  /** Returns whether JS is enabled and we are in a renderer process. */
  private isRenderEnabled(): boolean {
    const { enableJavaScript } = this.frontend.getOptions();
    return isRenderProcess() && enableJavaScript !== false;
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

    return this.frontend.getOptions().enableNative !== false;
  }

  /** Activates the Electron CrashReporter. */
  private installNativeHandler(): boolean {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.frontend.getDSN();
    if (!dsn) {
      throw new SentryError(
        'Invariant exception: install() must not be called when disabled',
      );
    }

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
        dsn,
        crashesDirectory,
        getCachePath(),
      );

      // Flush already cached minidumps from the queue.
      forget(this.uploader.flushQueue());

      // Start to submit recent minidump crashes. This will load breadcrumbs and
      // context information that was cached on disk prior to the crash.
      forget(
        this.sendNativeCrashes({
          crashed_process: 'browser',
        }),
      );

      // Every time a subprocess or renderer crashes, start sending minidumps
      // right away.
      app.on('web-contents-created', (_, contents) => {
        contents.on('crashed', async () => {
          forget(
            this.sendNativeCrashes({
              crashed_process: `renderer[${contents.id}]`,
              crashed_url: normalizeUrl(contents.getURL()),
            }),
          );
        });
      });
    }

    return true;
  }

  /** Activates the Node SDK for the main process. */
  private async installMainHandler(): Promise<boolean> {
    // Browser is the Electron main process (Node)
    const node = new NodeBackend(this.frontend);
    if (!node.install()) {
      return false;
    }

    this.inner = node;
    return true;
  }

  /** Activates the Browser SDK for the renderer process. */
  private async installRenderHandler(): Promise<boolean> {
    // Renderer is an Electron BrowserWindow, thus Chromium
    const browser = new BrowserBackend(this.frontend);
    if (!browser.install()) {
      return false;
    }

    this.inner = browser;
    return true;
  }

  /** Installs IPC handlers to receive events and metadata from renderers. */
  private installIPC(): void {
    ipcMain.on(IPC_CRUMB, (_: any, crumb: Breadcrumb) => {
      addBreadcrumb(crumb);
    });

    ipcMain.on(IPC_EVENT, (ipc: Electron.Event, event: SentryEvent) => {
      const contents = ipc.sender;
      const mergedEvent = {
        ...event,
        extra: {
          crashed_process: `renderer[${contents.id}]`,
          crashed_url: normalizeUrl(contents.getURL()),
          ...event.extra,
        },
      };

      captureEvent(mergedEvent);
    });

    ipcMain.on(IPC_CONTEXT, (_: any, context: Context) => {
      if (context.user) {
        setUserContext(context.user);
      }
      if (context.tags) {
        setTagsContext(context.tags);
      }
      if (context.extra) {
        setExtraContext(context.extra);
      }
    });
  }

  /** Installs auto-breadcrumb handlers for certain Electron events. */
  private installAutoBreadcrumbs(): void {
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

        addBreadcrumb(breadcrumb);
      }

      return emit(event, ...args);
    };
  }

  /**
   * Helper to call a method on the inner SDK (Browser or Node). It will error
   * if JavaScript reporting is turned off.
   */
  private async callInner<R>(
    callback: (inner: Backend) => Promise<R>,
  ): Promise<R> {
    if (this.inner === undefined) {
      throw new SentryError(
        'Invariant violation: Call install() before using other methods',
      );
    }

    return callback(this.inner);
  }
}
