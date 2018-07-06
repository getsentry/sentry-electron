// tslint:disable-next-line:no-implicit-dependencies
import { crashReporter, ipcRenderer, remote } from 'electron';

import { BrowserBackend } from '@sentry/browser';
import { SentryError } from '@sentry/core';
import { Scope } from '@sentry/hub';
import { Breadcrumb, SentryEvent, SentryResponse } from '@sentry/types';

import { CommonBackend, ElectronOptions, IPC_PING, IPC_SCOPE } from '../common';

/** Timeout used for registering with the main process. */
const PING_TIMEOUT = 500;

/** Backend implementation for Electron renderer backends. */
export class RendererBackend implements CommonBackend {
  /** The inner SDK used to record JavaScript events. */
  private readonly inner: BrowserBackend;

  /** Creates a new Electron backend instance. */
  public constructor(private readonly options: ElectronOptions) {
    this.inner = new BrowserBackend(options);
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
      success = this.inner.install() && success;
    }

    this.pingMainProcess();
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
  public async sendEvent(_: SentryEvent): Promise<SentryResponse> {
    throw new SentryError(
      'Invariant violation: Only supported in main process',
    );
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(_: Breadcrumb): boolean {
    throw new SentryError(
      'Invariant violation: Only supported in main process',
    );
  }

  /**
   * @inheritDoc
   */
  public storeScope(scope: Scope): void {
    ipcRenderer.send(IPC_SCOPE, scope);
  }

  /** Returns whether JS is enabled. */
  private isJavaScriptEnabled(): boolean {
    return this.options.enableJavaScript !== false;
  }

  /** Returns whether native reports are enabled. */
  private isNativeEnabled(): boolean {
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

    return this.options.enableNative !== false;
  }

  /** Activates the Electron CrashReporter. */
  private installNativeHandler(): boolean {
    // We will manually submit errors, but CrashReporter requires a submitURL in
    // some versions. Also, provide a productName and companyName, which we will
    // add manually to the event's context during submission.
    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: remote.app.getName(),
      submitURL: '',
      uploadToServer: false,
    });

    return true;
  }

  /** Checks if the main processes is available and logs a warning if not. */
  private pingMainProcess(): void {
    // For whatever reason we have to wait PING_TIMEOUT until we send the ping
    // to main. Other
    setTimeout(() => {
      ipcRenderer.send(IPC_PING);

      const timeout = setTimeout(() => {
        console.warn(
          'Could not connect to Sentry main process. Did you call init?',
        );
      }, PING_TIMEOUT);

      ipcRenderer.on(IPC_PING, () => {
        clearTimeout(timeout);
      });
    }, PING_TIMEOUT);
  }
}
