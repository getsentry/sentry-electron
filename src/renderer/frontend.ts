import { FrontendBase, Scope } from '@sentry/core';
import { Breadcrumb, Context, SdkInfo, SentryEvent } from '@sentry/shim';
// tslint:disable-next-line:no-implicit-dependencies
import { ipcRenderer } from 'electron';
import {
  CommonFrontend,
  ElectronOptions,
  IPC_CONTEXT,
  IPC_CRUMB,
  IPC_EVENT,
} from '../common';
import { RendererBackend } from './backend';

/** Frontend implementation for Electron renderer backends. */
export class RendererFrontend
  extends FrontendBase<RendererBackend, ElectronOptions>
  implements CommonFrontend {
  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    super(RendererBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected getSdkInfo(): SdkInfo {
    return {};
  }

  /**
   * @inheritDoc
   */
  public getInitialScope(): Scope {
    return {
      breadcrumbs: [],
      context: {},
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
    _path: string,
    _event: SentryEvent,
    _scope: Scope,
  ): Promise<void> {
    // TODO: Figure out whether this makes sense
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, scope: Scope): Promise<void> {
    ipcRenderer.send(IPC_EVENT, event, scope);
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(
    breadcrumb: Breadcrumb,
    scope: Scope,
  ): Promise<void> {
    ipcRenderer.send(IPC_CRUMB, breadcrumb, scope);
  }

  /**
   * @inheritDoc
   */
  public async setContext(nextContext: Context, scope: Scope): Promise<void> {
    ipcRenderer.send(IPC_CONTEXT, nextContext, scope);
  }
}
