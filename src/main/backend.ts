import {
  app,
  crashReporter,
  ipcMain,
  net,
  powerMonitor,
  screen,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';
import { join } from 'path';

import { Frontend, SentryError } from '@sentry/core';
import { NodeBackend } from '@sentry/node';
import {
  addBreadcrumb,
  Breadcrumb,
  captureEvent,
  captureMessage,
  Context,
  SentryEvent,
  setExtraContext,
  setTagsContext,
  setUserContext,
  Severity,
} from '@sentry/shim';
import { forget, Store } from '@sentry/utils';

import {
  CommonBackend,
  ElectronOptions,
  IPC_CONTEXT,
  IPC_CRUMB,
  IPC_EVENT,
  IPC_PING,
} from '../common';
import { captureMinidump } from '../sdk';
import { normalizeUrl } from './normalize';
import { MinidumpUploader } from './uploader';

/** A promise that resolves when the app is ready. */
let appReady = Promise.resolve();

/** Patch to access internal CrashReporter functionality. */
interface CrashReporterExt {
  getCrashesDirectory(): string;
}

/** Gets the path to the Sentry cache directory. */
function getCachePath(): string {
  return join(app.getPath('userData'), 'sentry');
}

/** Returns extra information from a renderer's web contents. */
function getRendererExtra(
  contents: Electron.WebContents,
): { [key: string]: string } {
  return {
    crashed_process: `renderer[${contents.id}]`,
    crashed_url: normalizeUrl(contents.getURL()),
  };
}

/** Backend implementation for Electron renderer backends. */
export class MainBackend implements CommonBackend {
  /** Handle to the SDK frontend for callbacks. */
  private readonly frontend: Frontend<ElectronOptions>;

  /** The inner SDK used to record Node events. */
  private readonly inner: NodeBackend;

  /** Store to persist breadcrumbs beyond application crashes. */
  private readonly breadcrumbs: Store<Breadcrumb[]>;

  /** Store to persist context information beyond application crashes. */
  private readonly context: Store<Context>;

  /** Uploader for minidump files. */
  private uploader?: MinidumpUploader;

  /** Creates a new Electron backend instance. */
  public constructor(frontend: Frontend<ElectronOptions>) {
    this.frontend = frontend;
    this.inner = new NodeBackend(frontend);

    const path = getCachePath();
    this.breadcrumbs = new Store<Breadcrumb[]>(path, 'breadcrumbs', []);
    this.context = new Store<Context>(path, 'context', {});
  }

  /**
   * @inheritDoc
   */
  public install(): boolean {
    let success = true;

    if (this.isNativeEnabled()) {
      success = this.installNativeHandler() && success;
    }

    if (this.isJavaScriptEnabled()) {
      success = this.installJavaScriptHandler() && success;
    }

    this.installIPC();
    this.installAutoBreadcrumbs();

    return success;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any): Promise<SentryEvent> {
    return this.inner.eventFromException(exception);
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string): Promise<SentryEvent> {
    return this.inner.eventFromMessage(message);
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<number> {
    await appReady;
    return this.inner.sendEvent(event);
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
      return this.uploader.uploadMinidump({ path, event });
    }

    return 200;
  }

  /** Returns the full list of breadcrumbs (or empty). */
  public loadBreadcrumbs(): Breadcrumb[] {
    return this.breadcrumbs.get();
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(breadcrumb: Breadcrumb): boolean {
    // We replicate the behavior of the frontend
    const { maxBreadcrumbs = 30 } = this.frontend.getOptions();
    this.breadcrumbs.update(breadcrumbs =>
      [...breadcrumbs, breadcrumb].slice(
        -Math.max(0, Math.min(maxBreadcrumbs, 100)),
      ),
    );

    // Still, the frontend should merge breadcrumbs into events, for now
    return true;
  }

  /** Returns the latest context (or empty). */
  public loadContext(): Context {
    return this.context.get();
  }

  /**
   * @inheritDoc
   */
  public storeContext(nextContext: Context): boolean {
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

  /** Returns whether JS is enabled. */
  private isJavaScriptEnabled(): boolean {
    return this.frontend.getOptions().enableJavaScript !== false;
  }

  /** Returns whether native reports are enabled. */
  private isNativeEnabled(): boolean {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
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
      productName: app.getName(),
      submitURL: '',
      uploadToServer: false,
    });

    // The crashReporter has an undocumented method to retrieve the directory
    // it uses to store minidumps in. The structure in this directory depends
    // on the crash library being used (Crashpad or Breakpad).
    const reporter: CrashReporterExt = crashReporter as any;
    const crashesDirectory = reporter.getCrashesDirectory();

    this.uploader = new MinidumpUploader(dsn, crashesDirectory, getCachePath());

    // Flush already cached minidumps from the queue.
    forget(this.uploader.flushQueue());

    // Start to submit recent minidump crashes. This will load breadcrumbs and
    // context information that was cached on disk prior to the crash.
    forget(this.sendNativeCrashes({}));

    // Every time a subprocess or renderer crashes, start sending minidumps
    // right away.
    app.on('web-contents-created', (_, contents) => {
      contents.on('crashed', async () => {
        try {
          await this.sendNativeCrashes(getRendererExtra(contents));
        } catch (e) {
          console.error(e);
        }

        addBreadcrumb({
          category: 'exception',
          level: Severity.Critical,
          message: 'Renderer Crashed',
          timestamp: new Date().getTime() / 1000,
        });
      });
    });

    if (this.frontend.getOptions().enableUnresponsive !== false) {
      app.on('browser-window-created', (_, window) => {
        window.on('unresponsive', () => {
          captureMessage('BrowserWindow Unresponsive');
        });
      });
    }

    return true;
  }

  /** Activates the Node SDK for the main process. */
  private async installJavaScriptHandler(): Promise<boolean> {
    if (!this.inner.install()) {
      return false;
    }

    // Override the transport mechanism with electron's net module
    this.inner.setTransport(net);

    // This is only needed for the electron net module
    appReady = app.isReady()
      ? Promise.resolve()
      : new Promise(resolve => {
          app.once('ready', resolve);
        });

    return true;
  }

  /** Installs IPC handlers to receive events and metadata from renderers. */
  private installIPC(): void {
    ipcMain.on(IPC_PING, (event: Electron.Event) => {
      event.sender.send(IPC_PING);
    });

    ipcMain.on(IPC_CRUMB, (_: any, crumb: Breadcrumb) => {
      addBreadcrumb(crumb);
    });

    ipcMain.on(IPC_EVENT, (ipc: Electron.Event, event: SentryEvent) => {
      event.extra = { ...getRendererExtra(ipc.sender), ...event.extra };
      captureEvent(event);
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

    app.once('ready', () => {
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
}
