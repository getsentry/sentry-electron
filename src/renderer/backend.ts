import { eventFromException, eventFromMessage } from '@sentry/browser';
import { BaseBackend, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Scope, Severity } from '@sentry/types';
import { walk as walkUtil } from '@sentry/utils';

import { CommonBackend, ElectronOptions, getNameFallback, IPC_EVENT, IPC_PING, IPC_SCOPE } from '../common';
import { requiresNativeHandlerRenderer } from '../electron-version';

/** Walks an object to perform a normalization on it with a maximum depth of 50 */
function walk(key: string, value: any): any {
  return walkUtil(key, value, 50);
}

interface AllElectron {
  crashReporter: Electron.CrashReporter;
  contextBridge: Electron.ContextBridge;
  ipcRenderer: Electron.IpcRenderer;
}

/** Requires and returns electron or undefined if it's unavailable  */
function requireElectron(): AllElectron | undefined {
  try {
    return require('electron');
  } catch (e) {
    //
  }

  return undefined;
}

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    __SENTRY_IPC__:
      | {
          sendScope: (scope: Scope) => void;
          sendEvent: (event: Event) => void;
          pingMain: (success: () => void) => void;
        }
      | undefined;
  }
}

/** Timeout used for registering with the main process. */
const PING_TIMEOUT = 500;

/** Backend implementation for Electron renderer backends. */
export class RendererBackend extends BaseBackend<ElectronOptions> implements CommonBackend<ElectronOptions> {
  /** Creates a new Electron backend instance. */
  public constructor(options: ElectronOptions) {
    if (options.enableJavaScript === false) {
      options.enabled = false;
    }
    super(options);

    const electron = requireElectron();

    if (electron) {
      // We are either in a preload script or nodeIntegration is enabled
      if (this._isNativeEnabled()) {
        this._installNativeHandler(electron.crashReporter);
      }

      this._hookIPC(electron.ipcRenderer, electron.contextBridge);
      this._pingMainProcess();
    } else {
      // We are in a renderer with contextIsolation = true
      if (window.__SENTRY_IPC__ == undefined) {
        // eslint-disable-next-line no-console
        console.warn(
          'contextIsolation is enabled but IPC has not been exposed. Did you call "init" in the preload script?',
        );
      }
    }

    this._setupScopeListener();
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    return eventFromException(this._options, exception, hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level?: Severity, hint?: EventHint): PromiseLike<Event> {
    return eventFromMessage(this._options, message, level, hint);
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): void {
    // Ensure breadcrumbs is not `undefined` as `walk` translates it into a string
    event.breadcrumbs = event.breadcrumbs || [];
    window.__SENTRY_IPC__?.sendEvent(event);
  }

  /**
   * Attaches IPC methods to window and uses contextBridge when available
   */
  private _hookIPC(ipcRenderer: Electron.IpcRenderer, contextBridge: Electron.ContextBridge | undefined): void {
    const ipcObject = {
      // We pass through JSON because in Electron >= 8, IPC uses v8's structured clone algorithm and throws errors if
      // objects have functions. Calling walk makes sure to break circular references.
      sendScope: (scope: Scope) => ipcRenderer.send(IPC_SCOPE, JSON.stringify(scope, walk)),
      sendEvent: (event: Event) => ipcRenderer.send(IPC_EVENT, JSON.stringify(event, walk)),
      pingMain: (success: () => void) => {
        ipcRenderer.once(IPC_PING, () => {
          success();
        });
        ipcRenderer.send(IPC_PING);
      },
    };

    window.__SENTRY_IPC__ = ipcObject;

    // We attempt to use contextBridge if it's available (Electron >= 6)
    if (contextBridge) {
      // This will fail if contextIsolation is not enabled but we have no other way to detect this from the renderer
      try {
        contextBridge.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
      } catch (e) {
        //
      }
    }
  }

  /**
   * Sends the scope to the main process once it updates.
   */
  private _setupScopeListener(): void {
    const scope = getCurrentHub().getScope();
    if (scope) {
      scope.addScopeListener(updatedScope => {
        window.__SENTRY_IPC__?.sendScope(updatedScope);
        scope.clearBreadcrumbs();
      });
    }
  }

  /** Returns whether native reports are enabled. */
  private _isNativeEnabled(): boolean {
    // On macOS, we should start the Electron CrashReporter only in the main
    // process. It uses Crashpad internally, which will catch errors from all
    // sub processes thanks to out-of-processes crash handling. On other
    // platforms we need to start the CrashReporter in every sub process. For
    // more information see: https://goo.gl/nhqqwD
    if (process.platform === 'darwin') {
      return false;
    }

    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return false;
    }

    return this._options.enableNative !== false;
  }

  /** Activates the Electron CrashReporter. */
  private _installNativeHandler(crashReporter: Electron.CrashReporter): void {
    // this is only necessary for electron versions before 8
    if (!requiresNativeHandlerRenderer()) {
      return;
    }

    // We will manually submit errors, but CrashReporter requires a submitURL in
    // some versions. Also, provide a productName and companyName, which we will
    // add manually to the event's context during submission.
    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: this._options.appName || getNameFallback(),
      submitURL: '',
      uploadToServer: false,
    });
  }

  /** Checks if the main processes is available and logs a warning if not. */
  private _pingMainProcess(): void {
    // For whatever reason we have to wait PING_TIMEOUT until we send the ping
    // to main.
    setTimeout(() => {
      const timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('Could not connect to Sentry main process. Did you call init?');
      }, PING_TIMEOUT);

      window.__SENTRY_IPC__?.pingMain(() => clearTimeout(timeout));
    }, PING_TIMEOUT);
  }
}
