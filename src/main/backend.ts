import {
  addBreadcrumb,
  BaseBackend,
  captureEvent,
  captureMessage,
  configureScope,
  getCurrentHub,
  Scope,
} from '@sentry/core';
import { NodeBackend } from '@sentry/node/dist/backend';
import { Event, EventHint, Severity, Transport, TransportOptions } from '@sentry/types';
import { Dsn, forget, logger, SentryError } from '@sentry/utils';
import { app, crashReporter, ipcMain } from 'electron';
import { join } from 'path';

import { CommonBackend, ElectronOptions, getNameFallback, IPC_EVENT, IPC_PING, IPC_SCOPE } from '../common';

import { captureMinidump } from './index';
import { normalizeUrl } from './normalize';
import { Store } from './store';
import { NetTransport } from './transports/net';
import { MinidumpUploader } from './uploader';

/** Gets the path to the Sentry cache directory. */
function getCachePath(): string {
  return join(app.getPath('userData'), 'sentry');
}

/**
 * Retruns a promise that resolves when app is ready.
 */
export async function isAppReady(): Promise<boolean> {
  return (
    app.isReady() ||
    // tslint:disable-next-line: no-promise-as-boolean
    new Promise<boolean>(resolve => {
      app.once('ready', () => {
        resolve(true);
      });
    })
  );
}

/** Backend implementation for Electron renderer backends. */
export class MainBackend extends BaseBackend<ElectronOptions> implements CommonBackend<ElectronOptions> {
  /** The inner SDK used to record Node events. */
  private readonly _inner: NodeBackend;

  /** Store to persist context information beyond application crashes. */
  private readonly _scopeStore: Store<Scope>;

  /** Uploader for minidump files. */
  private _uploader?: MinidumpUploader;

  /** Creates a new Electron backend instance. */
  public constructor(options: ElectronOptions) {
    super(options);
    this._inner = new NodeBackend(options);
    this._scopeStore = new Store<Scope>(getCachePath(), 'scope_v2', new Scope());

    let success = true;

    // The setImmediate is important here since the client has to be on the hub already that configureScope works
    setImmediate(() => {
      this._rehydrateScope();
      this._setupScopeListener();
    });

    if (this._isNativeEnabled()) {
      success = this._installNativeHandler() && success;
    }

    this._installIPC();
  }

  /**
   * Setup Transport
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const transportOptions: TransportOptions = {
      ...this._options.transportOptions,
      ...(this._options.httpProxy && { httpProxy: this._options.httpProxy }),
      ...(this._options.httpsProxy && { httpsProxy: this._options.httpsProxy }),
      ...(this._options.caCerts && { caCerts: this._options.caCerts }),
      dsn: this._options.dsn,
    };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }
    return new NetTransport(transportOptions);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    return this._inner.eventFromException(exception, hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): PromiseLike<Event> {
    return this._inner.eventFromMessage(message, level, hint);
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): void {
    if ((event as any).__INTERNAL_MINIDUMP) {
      // logger.log('Setting internal event on `crashReporter`', JSON.stringify(event).length);
      crashReporter.addExtraParameter('sentry', JSON.stringify(event));
    } else {
      this._inner.sendEvent(event);
    }
  }

  /**
   * Uploads the given minidump and attaches event information.
   *
   * @param path A relative or absolute path to the minidump file.
   * @param event Optional event information to add to the minidump request.
   */
  public uploadMinidump(path: string, event: Event = {}): void {
    if (this._uploader) {
      forget(this._uploader.uploadMinidump({ path, event }));
    }
  }

  /**
   * Loads the stored scope from disk ands sets it int the current scope
   */
  private _rehydrateScope(): void {
    // We refill the scope here to not have an empty one
    configureScope(scope => {
      // tslint:disable:no-unsafe-any
      const loadedScope = Scope.clone(this._scopeStore.get()) as any;

      if (loadedScope._user) {
        scope.setUser(loadedScope._user);
      }
      scope.setTags(loadedScope._tags);
      scope.setExtras(loadedScope._extra);
      if (loadedScope._breadcrumbs) {
        loadedScope._breadcrumbs.forEach((crumb: any) => {
          scope.addBreadcrumb(crumb);
        });
      }
      // tslint:enable:no-unsafe-any
    });
  }

  /**
   * Adds a scope listener to persist changes to disk.
   */
  private _setupScopeListener(): void {
    const hubScope = getCurrentHub().getScope();
    if (hubScope) {
      hubScope.addScopeListener(updatedScope => {
        const cloned = Scope.clone(updatedScope);
        (cloned as any)._eventProcessors = [];
        (cloned as any)._scopeListeners = [];
        // tslint:disable-next-line:no-object-literal-type-assertion
        this._scopeStore.update((current: Scope) => ({ ...current, ...cloned } as Scope));

        // if we use the crashpad minidump uploader we have to set extra whenever the scope updates
        if (this._options.useCrashpadMinidumpUploader !== false) {
          // @ts-ignore
          captureEvent({ __INTERNAL_MINIDUMP: true });
        }
      });
    }
  }

  /** Returns whether native reports are enabled. */
  private _isNativeEnabled(): boolean {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return false;
    }

    return this._options.enableNative !== false;
  }

  /** Activates the Electron CrashReporter. */
  private _installNativeHandler(): boolean {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsnString = this._options.dsn;
    if (!dsnString) {
      throw new SentryError('Invariant exception: install() must not be called when disabled');
    }

    const dsn = new Dsn(dsnString);

    // We will manually submit errors, but CrashReporter requires a submitURL in
    // some versions. Also, provide a productName and companyName, which we will
    // add manually to the event's context during submission.
    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: this._options.appName || getNameFallback(),
      submitURL: MinidumpUploader.minidumpUrlFromDsn(dsn),
      uploadToServer: this._options.useCrashpadMinidumpUploader || false,
    });

    if (this._options.useSentryMinidumpUploader !== false) {
      // The crashReporter has a method to retrieve the directory
      // it uses to store minidumps in. The structure in this directory depends
      // on the crash library being used (Crashpad or Breakpad).
      const crashesDirectory = crashReporter.getCrashesDirectory();

      this._uploader = new MinidumpUploader(dsn, crashesDirectory, getCachePath());

      // Flush already cached minidumps from the queue.
      forget(this._uploader.flushQueue());

      // Start to submit recent minidump crashes. This will load breadcrumbs and
      // context information that was cached on disk prior to the crash.
      forget(this._sendNativeCrashes({}));
    }

    // Every time a subprocess or renderer crashes, start sending minidumps
    // right away.
    app.on('web-contents-created', (_, contents) => {
      contents.on('crashed', async () => {
        try {
          await this._sendNativeCrashes(this._getRendererExtra(contents));
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

      if (this._options.enableUnresponsive !== false) {
        contents.on('unresponsive', () => {
          captureMessage('BrowserWindow Unresponsive');
        });
      }
    });

    return true;
  }

  /** Installs IPC handlers to receive events and metadata from renderers. */
  private _installIPC(): void {
    ipcMain.on(IPC_PING, (event: Electron.IpcMainEvent) => {
      event.sender.send(IPC_PING);
    });

    ipcMain.on(IPC_EVENT, (ipc: Electron.IpcMainEvent, jsonEvent: string) => {
      let event: Event;
      try {
        event = JSON.parse(jsonEvent) as Event;
      } catch {
        console.warn('sentry-electron received an invalid IPC_EVENT message');
        return;
      }

      event.extra = {
        ...this._getRendererExtra(ipc.sender),
        ...event.extra,
      };

      captureEvent(event);
    });

    ipcMain.on(IPC_SCOPE, (_: any, jsonRendererScope: string) => {
      let rendererScope: Scope;
      try {
        rendererScope = JSON.parse(jsonRendererScope) as Scope;
      } catch {
        console.warn('sentry-electron received an invalid IPC_SCOPE message');
        return;
      }
      // tslint:disable:no-unsafe-any
      const sentScope = Scope.clone(rendererScope) as any;
      configureScope(scope => {
        if (sentScope._user) {
          scope.setUser(sentScope._user);
        }
        scope.setTags(sentScope._tags);
        scope.setExtras(sentScope._extra);
        // Since we do not have updates for individual breadcrumbs anymore and only for the whole scope
        // we just add the last added breadcrumb on scope updates
        scope.addBreadcrumb(sentScope._breadcrumbs.pop());
      });
      // tslint:enable:no-unsafe-any
    });
  }

  /** Loads new native crashes from disk and sends them to Sentry. */
  private async _sendNativeCrashes(extra: object): Promise<void> {
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

    const uploader = this._uploader;
    if (uploader === undefined) {
      throw new SentryError('Invariant violation: Native crashes not enabled');
    }

    const currentCloned = Scope.clone(getCurrentHub().getScope());
    const fetchedScope = this._scopeStore.get();
    try {
      const storedScope = Scope.clone(fetchedScope);
      let newEvent = await storedScope.applyToEvent({ extra });

      if (newEvent) {
        newEvent = await currentCloned.applyToEvent(newEvent);
        const paths = await uploader.getNewMinidumps();
        paths.map(path => {
          captureMinidump(path, { ...newEvent });
        });
      }
    } catch (_oO) {
      logger.error('Error while sending native crash.');
    }
  }

  /** Returns extra information from a renderer's web contents. */
  private _getRendererExtra(contents: Electron.WebContents): { [key: string]: any } {
    const customName = this._options.getRendererName && this._options.getRendererName(contents);

    return {
      crashed_process: customName || `renderer[${contents.id}]`,
      crashed_url: normalizeUrl(contents.getURL()),
    };
  }
}
