// tslint:disable-next-line:no-implicit-dependencies
import { crashReporter, remote } from 'electron';

import { BrowserBackend } from '@sentry/browser';
import { Frontend, SentryError } from '@sentry/core';
import { Breadcrumb, Context, SentryEvent } from '@sentry/shim';

import { CommonBackend, ElectronOptions } from '../common';

/** Backend implementation for Electron renderer backends. */
export class RendererBackend implements CommonBackend {
  /** Handle to the SDK frontend for callbacks. */
  private readonly frontend: Frontend<ElectronOptions>;

  /** The inner SDK used to record JavaScript events. */
  private readonly inner: BrowserBackend;

  /** Creates a new Electron backend instance. */
  public constructor(frontend: Frontend<ElectronOptions>) {
    this.frontend = frontend;
    this.inner = new BrowserBackend(frontend);
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
  public async sendEvent(_: SentryEvent): Promise<number> {
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
  public storeContext(_: Context): boolean {
    throw new SentryError(
      'Invariant violation: Only supported in main process',
    );
  }

  /** Returns whether JS is enabled. */
  private isJavaScriptEnabled(): boolean {
    return this.frontend.getOptions().enableJavaScript !== false;
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

    return this.frontend.getOptions().enableNative !== false;
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
}
