import { BrowserOptions, ReportDialogOptions } from '@sentry/browser';
import { Backend, Client, Options, Scope } from '@sentry/core';
import { NodeOptions } from '@sentry/node';
import { SentryEvent } from '@sentry/types';

/** IPC to ping the main process when initializing in the renderer. */
export const IPC_PING = 'sentry-electron.ping';
/** IPC to send a captured event (exception or message) to Sentry. */
export const IPC_EVENT = 'sentry-electron.event';
/** IPC to capture a breadcrumb globally. */
export const IPC_CRUMB = 'sentry-electron.breadcrumbs';
/** IPC to capture a scope globally. */
export const IPC_SCOPE = 'sentry-electron.scope';

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

  /**
   * Enables event reporting for BrowserWindow 'unresponsive' events
   * Defaults to `true`.
   */
  enableUnresponsive?: boolean;

  /**
   * Callback to allow custom naming of renderer processes
   * If the callback is not set, or it returns `undefined`, the default naming
   * scheme is used.
   */
  getRendererName?(contents: Electron.WebContents): string | undefined;
}

/** Common interface for Electron clients. */
export interface CommonClient extends Client<ElectronOptions> {
  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope The SDK scope used to upload.
   */
  captureMinidump(path: string, event: SentryEvent, scope: Scope): Promise<void>;

  /**
   * @inheritdoc {@link BrowserClient.showReportDialog}
   */
  showReportDialog(options: ReportDialogOptions): void;
}

/** Common interface for Electron backends. */
export { Backend as CommonBackend };
