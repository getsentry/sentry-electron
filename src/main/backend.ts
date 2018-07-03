import {
  app,
  crashReporter,
  ipcMain,
  powerMonitor,
  screen,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';
import { join } from 'path';

import {
  addBreadcrumb,
  captureEvent,
  captureMessage,
  configureScope,
} from '@sentry/minimal';
import {
  Breadcrumb,
  SentryEvent,
  SentryResponse,
  Severity,
  Status,
} from '@sentry/types';

import { DSN, SentryError } from '@sentry/core';
import { Scope } from '@sentry/hub';
import { NodeBackend } from '@sentry/node';
import { forget } from '@sentry/utils/async';
import { Store } from '@sentry/utils/store';

import {
  CommonBackend,
  ElectronOptions,
  IPC_CRUMB,
  IPC_EVENT,
  IPC_PING,
  IPC_SCOPE,
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
): { [key: string]: any } {
  return {
    crashed_process: `renderer[${contents.id}]`,
    crashed_url: normalizeUrl(contents.getURL()),
  };
}

/** Backend implementation for Electron renderer backends. */
export class MainBackend implements CommonBackend {
  /** The inner SDK used to record Node events. */
  private readonly inner: NodeBackend;

  /** Store to persist context information beyond application crashes. */
  private readonly scope: Store<Scope>;

  /** Uploader for minidump files. */
  private uploader?: MinidumpUploader;

  /** Creates a new Electron backend instance. */
  public constructor(private readonly options: ElectronOptions) {
    this.inner = new NodeBackend(options);

    const path = getCachePath();
    this.scope = new Store<Scope>(path, 'scope', new Scope());
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
      success = this.installNodeHandler() && success;
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
  public async sendEvent(event: SentryEvent): Promise<SentryResponse> {
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
  ): Promise<SentryResponse> {
    if (this.uploader) {
      return this.uploader.uploadMinidump({ path, event });
    }
    return { code: 200, event_id: event.event_id, status: Status.Success };
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(_: Breadcrumb): boolean {
    return true;
  }

  /**
   * @inheritDoc
   */
  public storeScope(scope: Scope): void {
    this.scope.set(scope);
  }

  /** Returns whether JS is enabled. */
  private isJavaScriptEnabled(): boolean {
    return this.options.enableJavaScript !== false;
  }

  /** Returns whether native reports are enabled. */
  private isNativeEnabled(): boolean {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return false;
    }

    return this.options.enableNative !== false;
  }

  /** Activates the Electron CrashReporter. */
  private installNativeHandler(): boolean {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.options.dsn;
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

    this.uploader = new MinidumpUploader(
      new DSN(dsn),
      crashesDirectory,
      getCachePath(),
    );

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

    if (this.options.enableUnresponsive !== false) {
      app.on('browser-window-created', (_, window) => {
        window.on('unresponsive', () => {
          captureMessage('BrowserWindow Unresponsive');
        });
      });
    }

    return true;
  }

  /** Activates the Node SDK for the main process. */
  private async installNodeHandler(): Promise<boolean> {
    if (!this.inner.install()) {
      return false;
    }

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
      event.extra = {
        ...getRendererExtra(ipc.sender),
        ...event.extra,
      };
      captureEvent(event);
    });

    ipcMain.on(IPC_SCOPE, (_: any, rendererScope: Scope) => {
      configureScope(scope => {
        if (rendererScope.getUser()) {
          scope.setUser(rendererScope.getUser());
        }
        if (rendererScope.getTags()) {
          Object.keys(rendererScope.getTags()).forEach(key => {
            scope.setTag(key, rendererScope.getTags()[key]);
          });
        }
        if (rendererScope.getExtra()) {
          Object.keys(rendererScope.getExtra()).forEach(key => {
            scope.setExtra(key, rendererScope.getExtra()[key]);
          });
        }
      });
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
    // TODO: Maybe make this cleaner
    const storedScope = this.scope.get() as any;
    // tslint:disable:no-unsafe-any
    const nextExtra = { ...storedScope.extra, ...extra };
    const event: SentryEvent = {
      breadcrumbs: storedScope.breadcrumbs,
      extra: nextExtra,
      tags: storedScope.tags,
      user: storedScope.user,
    };
    // tslint:enable:no-unsafe-any
    const paths = await uploader.getNewMinidumps();
    paths.map(path => {
      captureMinidump(path, event);
    });
  }
}
