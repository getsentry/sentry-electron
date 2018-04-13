import { FrontendBase, Scope } from '@sentry/core';
import { Breadcrumb, Context, SdkInfo, SentryEvent } from '@sentry/shim';
// tslint:disable-next-line:no-implicit-dependencies
import { ipcRenderer } from 'electron';
import { ElectronBackend, ElectronOptions } from './backend';
import { addEventDefaults } from './context';
import { IPC_CONTEXT, IPC_CRUMB, IPC_EVENT } from './ipc';
import { isRenderProcess } from './utils';

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
   * @inheritDoc
   */
  public getInitialScope(): Scope {
    return {
      breadcrumbs: this.getBackend().loadBreadcrumbs(),
      context: this.getBackend().loadContext(),
    };
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope The SDK scope used to upload.
   */
  public async captureMinidump(
    path: string,
    event: SentryEvent = {},
    scope: Scope = this.getInternalScope(),
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

  /**
   * @inheritDoc
   */
  protected async prepareEvent(
    event: SentryEvent,
    scope: Scope,
  ): Promise<SentryEvent> {
    const prepared = await super.prepareEvent(event, scope);
    return addEventDefaults(prepared);
  }
}
