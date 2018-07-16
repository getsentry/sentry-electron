import { BaseClient, Scope } from '@sentry/core';
import {
  Breadcrumb,
  SdkInfo,
  SentryEvent,
  SentryResponse,
} from '@sentry/types';
import { CommonClient, ElectronOptions } from '../common';
import { MainBackend } from './backend';

/** SDK name used in every event. */
const SDK_NAME = 'sentry-electron';

/** SDK version used in every event. */
// tslint:disable-next-line
const SDK_VERSION: string = require('../../package.json').version;

/** Frontend implementation for Electron renderer backends. */
export class MainClient extends BaseClient<MainBackend, ElectronOptions>
  implements CommonClient {
  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    super(MainBackend, options);
  }

  /**
   * @inheritDoc
   */
  public getSdkInfo(): SdkInfo {
    return { name: SDK_NAME, version: SDK_VERSION };
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope Optional SDK scope used to upload.
   */
  public async captureMinidump(
    path: string,
    event: SentryEvent = {},
    scope?: Scope,
  ): Promise<void> {
    event.tags = { event_type: 'native', ...event.tags };
    await this.processEvent(
      event,
      async finalEvent => this.getBackend().uploadMinidump(path, finalEvent),
      scope,
    );
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(
    event: SentryEvent,
    scope?: Scope,
  ): Promise<SentryResponse> {
    event.tags = { event_type: 'javascript', ...event.tags };
    return super.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(
    breadcrumb: Breadcrumb,
    scope?: Scope,
  ): Promise<void> {
    await super.addBreadcrumb(breadcrumb, scope);
  }
}
