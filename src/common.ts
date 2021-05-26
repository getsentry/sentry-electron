import { BrowserOptions, ReportDialogOptions } from '@sentry/browser';
import { BaseBackend } from '@sentry/core';
import { NodeOptions } from '@sentry/node';
import { Client, Event, Options, Scope } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import { App } from 'electron';

export const IPC = {
  /** IPC to ping the main process when initializing in the renderer. */
  PING: 'sentry-electron.ping',
  /** IPC to send a captured event (exception or message) to Sentry. */
  EVENT: 'sentry-electron.event',
  /** IPC to capture a scope globally. */
  SCOPE: 'sentry-electron.scope',
  /** IPC for sending native crash params to the renderers  */
  EXTRA_PARAMS: 'sentry-electron.extra-params',
};

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
   * The name of the application. Primarily used for crash directory naming. If this property is not supplied,
   * it will be retrieved using the Electron `app.getName/name` API. If you disable the Electron `remote` module in
   * the renderer, this property is required.
   */
  appName?: string;

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
   * Enables the Sentry internal uploader for minidumps.
   * Defaults to `true`.
   */
  useSentryMinidumpUploader?: boolean;

  /**
   * This sets `uploadToServer` of the crashReporter to `true`. The SDK also tries to set data (Sentry Event)
   * with `crashReporter.addExtraParameter` to provide more context. Keep in mind, you should set
   * `useSentryMinidumpUploader` to `false` otherwise you recieve the crash report twice.
   * Defaults to `false`.
   */
  useCrashpadMinidumpUploader?: boolean;

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
export interface ElectronClient extends Client<ElectronOptions> {
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
   * A `String` property that indicates the current application's name, which is the
   * name in the application's `package.json` file.
   *
   * Usually the `name` field of `package.json` is a short lowercase name, according
   * to the npm modules spec. You should usually also specify a `productName` field,
   * which is your application's full capitalized name, and which will be preferred
   * over `name` by Electron.
   */
  name: string;

  /**
   * Usually the name field of package.json is a short lowercased name, according to
   * the npm modules spec. You should usually also specify a productName field, which
   * is your application's full capitalized name, and which will be preferred over
   * name by Electron.
   */
  getName(): string;
}

/** Get the name of an electron app for <v5 and v7< */
export function getNameFallback(): string {
  if (typeof require === 'undefined') {
    throw new SentryError(
      'Could not require("electron") to get appName. Please ensure you pass `appName` to Sentry options',
    );
  }

  const electron = require('electron');

  // if we're in the main process
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (electron && electron.app) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const appMain = electron.app as CrossApp;
    return appMain.name || appMain.getName();
  }

  // We're in the renderer process but the remote module is not available
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!electron || !electron.remote) {
    throw new SentryError(
      'The Electron `remote` module was not available to get appName. Please ensure you pass `appName` to Sentry options',
    );
  }

  // Remote is available so get the app name
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const a = electron.remote.app as CrossApp;
  return a.name || a.getName();
}

/** Common interface for Electron backends. */
export { BaseBackend as CommonBackend };
