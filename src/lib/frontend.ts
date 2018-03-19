import {
  Breadcrumb,
  Context,
  FrontendBase,
  Sdk,
  SdkInfo,
  SentryEvent,
} from '@sentry/core';
// tslint:disable-next-line:no-implicit-dependencies
import { ipcRenderer } from 'electron';
import { ElectronBackend, ElectronOptions } from './backend';
import { IPC_CONTEXT, IPC_CRUMB } from './ipc';
import { isRenderProcess } from './utils';

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

  /**
   * TODO
   * @param path
   */
  public async captureMinidump(
    path: string,
    event: SentryEvent = {},
  ): Promise<void> {
    const prepared = await this.prepareEvent(event);
    await this.getBackend().uploadMinidump(path, prepared);
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(breadcrumb: Breadcrumb): Promise<void> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_CRUMB, breadcrumb);
    } else {
      await super.addBreadcrumb(breadcrumb);
    }
  }

  /**
   * @inheritDoc
   */
  public async setContext(nextContext: Context): Promise<void> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_CONTEXT, nextContext);
    } else {
      await super.setContext(nextContext);
    }
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
