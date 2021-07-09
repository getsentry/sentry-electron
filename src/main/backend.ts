/* eslint-disable max-lines */
import {
  addBreadcrumb,
  BaseBackend,
  captureEvent,
  captureMessage,
  configureScope,
  getCurrentHub,
  Scope,
} from '@sentry/core';
import { NodeBackend } from '@sentry/node';
import { Event, EventHint, ScopeContext, Severity, Transport, TransportOptions } from '@sentry/types';
import { Dsn, forget, logger, SentryError } from '@sentry/utils';
import { app, crashReporter, ipcMain } from 'electron';
import { join } from 'path';

import { CommonBackend, ElectronOptions, getNameFallback, IPC } from '../common';
import { supportsGetPathCrashDumps, supportsRenderProcessGone } from '../electron-version';
import { addEventDefaults } from './context';
import { captureMinidump } from './index';
import { normalizeEvent, normalizeUrl } from './normalize';
import { Store } from './store';
import { NetTransport } from './transports/net';
import { MinidumpUploader } from './uploader';

/** Gets the path to the Sentry cache directory. */
function getCachePath(): string {
  return join(app.getPath('userData'), 'sentry');
}

/**
 * Returns a promise that resolves when app is ready.
 */
export async function isAppReady(): Promise<boolean> {
  return (
    app.isReady() ||
    new Promise<boolean>(resolve => {
      app.once('ready', () => {
        resolve(true);
      });
    })
  );
}

/** Is object defined and has keys */
function hasKeys(obj: any): boolean {
  return obj != undefined && Object.keys(obj).length > 0;
}

/** Gets a Scope object with user, tags and extra */
function getScope(): Partial<ScopeContext> {
  const scope = getCurrentHub().getScope() as any | undefined;

  if (!scope) {
    return {};
  }

  return {
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    ...(hasKeys(scope._user) && { user: scope._user }),
    ...(hasKeys(scope._tags) && { tags: scope._tags }),
    ...(hasKeys(scope._extra) && { extra: scope._extra }),
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  };
}

/** Backend implementation for Electron renderer backends. */
export class MainBackend extends BaseBackend<ElectronOptions> implements CommonBackend<ElectronOptions> {
  /** The inner SDK used to record Node events. */
  private readonly _inner: NodeBackend;

  /** Store to persist context information beyond application crashes. */
  private readonly _scopeStore: Store<Scope>;

  /** Temp store for the scope of last run */
  private _scopeLastRun?: Scope;

  /** Uploader for minidump files. */
  private _uploader?: MinidumpUploader;

  /** Counter used to ensure no race condition when updating extra params */
  private _updateEpoch: number;

  /** Creates a new Electron backend instance. */
  public constructor(options: ElectronOptions) {
    // Disable session tracking until we've decided how this should work with Electron
    options.autoSessionTracking = false;

    super(options);

    this._inner = new NodeBackend(options);
    this._scopeStore = new Store<Scope>(getCachePath(), 'scope_v2', new Scope());
    // We need to store the scope in a variable here so it can be attached to minidumps
    this._scopeLastRun = this._scopeStore.get();
    this._updateEpoch = 0;

    this._setupScopeListener();

    if (this._isNativeEnabled()) {
      this._installNativeHandler();
    }

    this._installIPC();
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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
    this._inner.sendEvent(event);
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
   * Adds a scope listener to persist changes to disk.
   */
  private _setupScopeListener(): void {
    const hubScope = getCurrentHub().getScope();
    if (hubScope) {
      hubScope.addScopeListener(updatedScope => {
        const scope = Scope.clone(updatedScope);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (scope as any)._eventProcessors = [];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (scope as any)._scopeListeners = [];

        this._scopeStore.set(scope);

        // If we use the Crashpad minidump uploader we have to set extra whenever the scope updates
        //
        // We do not currently set addExtraParameter on Linux because Breakpad is limited
        if (this._options.useCrashpadMinidumpUploader === true && process.platform !== 'linux') {
          this._updateExtraParams(scope);
        }
      });
    }
  }

  /** Updates Electron uploader extra params */
  private _updateExtraParams(scope: Scope): void {
    this._updateEpoch += 1;
    const currentEpoch = this._updateEpoch;

    forget(
      this._getNativeUploaderEvent(scope).then(event => {
        if (currentEpoch !== this._updateEpoch) return;

        // Update the extra parameters in the main process
        const mainParams = this._getNativeUploaderExtraParams(event);
        for (const key of Object.keys(mainParams)) {
          crashReporter.addExtraParameter(key, mainParams[key]);
        }
      }),
    );
  }

  /** Builds up an event to send with the native Electron uploader */
  private async _getNativeUploaderEvent(scope: Scope): Promise<Event> {
    // Basic SDK info
    let event: Event = {
      tags: { event_type: 'native' },
    };

    // Apply the scope to the event
    await scope.applyToEvent(event);
    // Add all the extra context
    event = await addEventDefaults(this._options.appName, event);
    return normalizeEvent(event);
  }

  /** Chunks up event JSON into 1 or more parameters for use with the native Electron uploader
   *
   * Returns chunks with keys and values:
   * {
   *    sentry__1: '{ json...',
   *    sentry__2: 'more json...',
   *    sentry__x: 'end json }',
   * }
   */
  private _getNativeUploaderExtraParams(event: Event): { [key: string]: string } {
    const maxBytes = 20300;

    /** Max chunk sizes are in bytes so we can't chunk by characters or UTF8 could bite us.
     *
     * We attempt to split by space (32) and double quote characters (34) as there are plenty in JSON
     * and they are guaranteed to not be the first byte of a multi-byte UTF8 character.
     */
    let buf = Buffer.from(JSON.stringify(event));
    const chunks = [];
    while (buf.length) {
      // Find last '"'
      let i = buf.lastIndexOf(34, maxBytes + 1);
      // Or find last ' '
      if (i < 0) i = buf.lastIndexOf(32, maxBytes + 1);
      // Or find first '"'
      if (i < 0) i = buf.indexOf(34, maxBytes);
      // Or find first ' '
      if (i < 0) i = buf.indexOf(32, maxBytes);
      // We couldn't find any space or quote chars so split at maxBytes and hope for the best 🤷‍♂️
      if (i < 0) i = maxBytes;
      chunks.push(buf.slice(0, i + 1).toString());
      buf = buf.slice(i + 1);
    }

    return chunks.reduce((acc, cur, i) => {
      acc[`sentry__${i + 1}`] = cur;
      return acc;
    }, {} as { [key: string]: string });
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
  private _installNativeHandler(): void {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsnString = this._options.dsn;
    if (!dsnString) {
      throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
    }

    // We don't add globalExtra for Linux because Breakpad doesn't support JSON like strings:
    // https://github.com/electron/electron/issues/29711
    const globalExtra =
      process.platform !== 'linux' ? { sentry___initialScope: JSON.stringify(getScope()) } : undefined;

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
      compress: true,
      globalExtra,
    });

    if (this._options.useSentryMinidumpUploader !== false) {
      // The crashReporter has a method to retrieve the directory
      // it uses to store minidumps in. The structure in this directory depends
      // on the crash library being used (Crashpad or Breakpad).
      const crashesDirectory = supportsGetPathCrashDumps()
        ? app.getPath('crashDumps')
        : // unsafe member access required because of older versions of Electron
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (crashReporter as any).getCrashesDirectory();

      this._uploader = new MinidumpUploader(dsn, crashesDirectory, getCachePath(), this.getTransport());

      // Flush already cached minidumps from the queue.
      forget(this._uploader.flushQueue());

      // Start to submit recent minidump crashes. This will load breadcrumbs and
      // context information that was cached on disk prior to the crash.
      forget(this._sendNativeCrashes({}));
    }

    /**
     * Helper function for sending renderer crashes
     */
    const sendRendererCrash = async (
      contents: Electron.WebContents,
      details?: Electron.RenderProcessGoneDetails,
    ): Promise<void> => {
      if (this._options.useSentryMinidumpUploader !== false) {
        try {
          await this._sendNativeCrashes(this._getNewEventWithElectronContext(contents, details));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      }

      addBreadcrumb({
        category: 'exception',
        level: Severity.Critical,
        message: 'Renderer Crashed',
      });
    };

    // Every time a subprocess or renderer crashes, start sending minidumps
    // right away.
    app.on('web-contents-created', (_, contents) => {
      if (supportsRenderProcessGone()) {
        contents.on('render-process-gone', async (_event, details) => {
          await sendRendererCrash(contents, details);
        });
      } else {
        // unsafe member access required because of older versions of Electron
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (contents as any).on('crashed', async () => {
          await sendRendererCrash(contents);
        });
      }

      if (this._options.enableUnresponsive !== false) {
        contents.on('unresponsive', () => {
          captureMessage('BrowserWindow Unresponsive');
        });
      }
    });
  }

  /** Installs IPC handlers to receive events and metadata from renderers. */
  private _installIPC(): void {
    ipcMain.on(IPC.PING, (event: Electron.IpcMainEvent) => {
      event.sender.send(IPC.PING);
    });

    ipcMain.on(IPC.EVENT, (ipc: Electron.IpcMainEvent, jsonEvent: string) => {
      let event: Event;
      try {
        event = JSON.parse(jsonEvent) as Event;
      } catch {
        // eslint-disable-next-line no-console
        console.warn('sentry-electron received an invalid IPC_EVENT message');
        return;
      }

      event.contexts = {
        ...this._getNewEventWithElectronContext(ipc.sender).contexts,
        ...event.contexts,
      };

      captureEvent(event);
    });

    ipcMain.on(IPC.SCOPE, (_: any, jsonRendererScope: string) => {
      let rendererScope: Scope;
      try {
        rendererScope = JSON.parse(jsonRendererScope) as Scope;
      } catch {
        // eslint-disable-next-line no-console
        console.warn('sentry-electron received an invalid IPC_SCOPE message');
        return;
      }
      const sentScope = Scope.clone(rendererScope) as any;
      /* eslint-disable @typescript-eslint/no-unsafe-member-access */
      configureScope(scope => {
        if (hasKeys(sentScope._user)) {
          scope.setUser(sentScope._user);
        }

        if (hasKeys(sentScope._tags)) {
          scope.setTags(sentScope._tags);
        }

        if (hasKeys(sentScope._extra)) {
          scope.setExtras(sentScope._extra);
        }

        // Since we do not have updates for individual breadcrumbs any more and only for the whole scope
        // we just add the last added breadcrumb on scope updates
        scope.addBreadcrumb(sentScope._breadcrumbs.pop(), this._options.maxBreadcrumbs);
      });
      /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    });
  }

  /** Loads new native crashes from disk and sends them to Sentry. */
  private async _sendNativeCrashes(event: Event): Promise<void> {
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

    if (this._options.useSentryMinidumpUploader === false) {
      // In case we are not using the Sentry Minidump uploader we don't want to throw an error
      return;
    }

    const uploader = this._uploader;
    if (uploader === undefined) {
      throw new SentryError('Invariant violation: Native crashes not enabled');
    }

    try {
      const paths = await uploader.getNewMinidumps();
      // We only want to read the scope from disk in case there was a crash last run
      if (paths.length > 0) {
        const currentCloned = Scope.clone(getCurrentHub().getScope());
        const storedScope = Scope.clone(this._scopeLastRun);
        let newEvent = await storedScope.applyToEvent(event);
        if (newEvent) {
          newEvent = await currentCloned.applyToEvent(newEvent);
          paths.map(path => {
            captureMinidump(path, { ...newEvent });
          });
        }
        // Unset to recover memory
        this._scopeLastRun = undefined;
      }
    } catch (_oO) {
      logger.error('Error while sending native crash.');
    }
  }

  /** Returns extra information from a renderer's web contents. */
  private _getNewEventWithElectronContext(
    contents: Electron.WebContents,
    details?: Electron.RenderProcessGoneDetails,
  ): Event {
    const customName = this._options.getRendererName && this._options.getRendererName(contents);
    const electronContext: Record<string, any> = {
      crashed_process: customName || `renderer[${contents.id}]`,
      crashed_url: normalizeUrl(contents.getURL()),
    };
    if (details) {
      // We need to do it like this, otherwise we normalize undefined to "[undefined]" in the UI
      electronContext.details = details;
    }
    return {
      contexts: {
        electron: electronContext,
      },
    };
  }
}
