import { release, type } from 'os';

import { FrontendBase, Sdk, SdkInfo } from '@sentry/core';
import { ElectronBackend, ElectronOptions } from './backend';

/** SDK name used in every event. */
const SDK_NAME = 'sentry-electron';
/** SDK version used in every event. */
// tslint:disable-next-line
const SDK_VERSION: string = require('../../package.json').version;

/**
 * The Sentry Electron SDK Frontend.
 *
 * @see ElectronOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ElectronFrontend extends FrontendBase<
  ElectronBackend,
  ElectronOptions
> {
  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    super(ElectronBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected getSdkInfo(): SdkInfo {
    return { name: SDK_NAME, version: SDK_VERSION };
  }
}

/**
 * The Sentry Electron SDK Client.
 *
 * To use this SDK, call the {@link Sdk.create} function as early as possible
 * in the entry modules. This applies to the main process as well as all
 * renderer processes or further sub processes you spawn. To set context
 * information or send manual events, use the provided methods.
 *
 * @example
 * const { SentryClient } = require('@sentry/electron');
 *
 * SentryClient.create({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * @example
 * SentryClient.setContext({
 *   extra: { battery: 0.7 },
 *   tags: { user_mode: 'admin' },
 *   user: { id: '4711' },
 * });
 *
 * @example
 * SentryClient.addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 *
 * @example
 * SentryClient.captureMessage('Hello, world!');
 * SentryClient.captureException(new Error('Good bye'));
 * SentryClient.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 *
 * @see ElectronOptions for documentation on configuration options.
 */
// tslint:disable-next-line:variable-name
export const SentryClient = new Sdk(ElectronFrontend);
