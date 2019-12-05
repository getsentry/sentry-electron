import { BrowserOptions, ReportDialogOptions } from '@sentry/browser';
import { BaseBackend } from '@sentry/core';
import { NodeOptions } from '@sentry/node';
import { Client, Event, Options, Scope } from '@sentry/types';
import { App } from 'electron';

/** IPC to ping the main process when initializing in the renderer. */
export const IPC_PING = 'sentry-electron.ping';
/** IPC to send a captured event (exception or message) to Sentry. */
export const IPC_EVENT = 'sentry-electron.event';
/** IPC to capture a scope globally. */
export const IPC_SCOPE = 'sentry-electron.scope';

/**
 * Configuration options for {@link ElectronOptions}.
 *
 * By default, all native crashes and JavaScript errors will be captured and
 * sent to Sentry. Note that these settings have to be specified during startup
 * and cannot be changed later.
 *
 * This options object can also contain options for the Browser and Node SDKs,
 * which are being used under the hood to record JavaScript errors. Please refer
 * to their documentation for a description of the fields.
 *
 * @see BrowserOptions
 * @see NodeOptions
 * @see ElectronOptions
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
   * @param scope Optional The SDK scope used to upload.
   */
  captureMinidump(path: string, event?: Event, scope?: Scope): string | undefined;

  /**
   * Shows Report Dialog
   */
  showReportDialog(options: ReportDialogOptions): void;
}

/** Name retrieval references for both Electron <v5 and v7< */
declare interface CrossApp extends App {
  /**
   * Usually the name field of package.json is a short lowercased name, according to
   * the npm modules spec. You should usually also specify a productName field, which
   * is your application's full capitalized name, and which will be preferred over
   * name by Electron.
   */
  getName(): string;

  /**
   * A `String` property that indicates the current application's name, which is the
   * name in the application's `package.json` file.
   *
   * Usually the `name` field of `package.json` is a short lowercase name, according
   * to the npm modules spec. You should usually also specify a `productName` field,
   * which is your application's full capitalized name, and which will be preferred
   * over `name` by Electron.
   */
  name: string;
}

/** Get the name of an electron app for <v5 and v7< */
export function getName(app: App): string {
  const a = app as CrossApp;
  return a.name || a.getName();
}

/** Common interface for Electron backends. */
export { BaseBackend as CommonBackend };
