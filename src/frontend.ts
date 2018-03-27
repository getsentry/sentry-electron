import {
  Breadcrumb,
  Context,
  createAndBind,
  FrontendBase,
  Scope,
  SdkInfo,
  SentryEvent,
} from '@sentry/core';
import { callOnClient } from '@sentry/shim';
// tslint:disable-next-line:no-implicit-dependencies
import { ipcRenderer } from 'electron';
import { ElectronBackend, ElectronOptions } from './backend';
import { IPC_CONTEXT, IPC_CRUMB, IPC_EVENT } from './ipc';
import { isRenderProcess } from './utils';

export { addBreadcrumb, captureEvent, setUserContext } from '@sentry/core';
export {
  captureException,
  captureMessage,
  clearScope,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
} from '@sentry/shim';

/** SDK name used in every event. */
const SDK_NAME = 'sentry-electron';
/** SDK version used in every event. */
// tslint:disable-next-line
const SDK_VERSION: string = require('../package.json').version;

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
    scope: Scope = this.getInitialScope(),
  ): Promise<void> {
    const prepared = await this.prepareEvent(event, scope);
    await this.getBackend().uploadMinidump(path, prepared);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, scope: Scope): Promise<void> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_EVENT, event, scope);
    } else {
      await super.captureEvent(event, scope);
    }
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(
    breadcrumb: Breadcrumb,
    scope: Scope,
  ): Promise<void> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_CRUMB, breadcrumb, scope);
    } else {
      await super.addBreadcrumb(breadcrumb, scope);
    }
  }

  /**
   * @inheritDoc
   */
  public async setContext(nextContext: Context, scope: Scope): Promise<void> {
    if (isRenderProcess()) {
      ipcRenderer.send(IPC_CONTEXT, nextContext, scope);
    } else {
      await super.setContext(nextContext, scope);
    }
  }
}

/**
 * TODO
 * @param path
 * @param event
 */
export function captureMinidump(path: string, event: SentryEvent = {}): void {
  callOnClient('captureMinidump', path, event);
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
export function create(options: ElectronOptions): void {
  createAndBind(ElectronFrontend, options);
}
