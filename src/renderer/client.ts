import { BaseClient, Scope } from '@sentry/core';
import {
  Breadcrumb,
  SdkInfo,
  SentryEvent,
  SentryResponse,
} from '@sentry/types';
// tslint:disable-next-line:no-implicit-dependencies
import { ipcRenderer } from 'electron';
import {
  CommonClient,
  ElectronOptions,
  IPC_CRUMB,
  IPC_EVENT,
  // IPC_SCOPE,
} from '../common';
import { RendererBackend } from './backend';

/** Frontend implementation for Electron renderer backends. */
export class RendererClient extends BaseClient<RendererBackend, ElectronOptions>
  implements CommonClient {
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
  public getSdkInfo(): SdkInfo {
    return {};
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
    // Noop
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(
    event: SentryEvent,
    scope?: Scope,
  ): Promise<SentryResponse> {
    ipcRenderer.send(IPC_EVENT, event, scope);
    // TODO
    return { code: 200 };
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

  // TODO
  /**
   * @inheritDoc
   */
  // public async setContext(nextContext: Context, scope: Scope): Promise<void> {
  //   ipcRenderer.send(IPC_CONTEXT, nextContext, scope);
  // }
}
