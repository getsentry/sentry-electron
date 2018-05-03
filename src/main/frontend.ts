import { FrontendBase, Scope } from '@sentry/core';
import { Breadcrumb, Context, SdkInfo, SentryEvent } from '@sentry/shim';
import { CommonFrontend, ElectronOptions } from '../common';
import { MainBackend } from './backend';
import { addEventDefaults } from './context';
import { normalizeEvent } from './normalize';

/** SDK name used in every event. */
const SDK_NAME = 'sentry-electron';

/** SDK version used in every event. */
// tslint:disable-next-line
const SDK_VERSION: string = require('../../package.json').version;

/** Frontend implementation for Electron renderer backends. */
export class MainFrontend extends FrontendBase<MainBackend, ElectronOptions>
  implements CommonFrontend {
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
    event.tags = { event_type: 'native', ...event.tags };
    await this.processEvent(event, scope, async finalEvent =>
      this.getBackend().uploadMinidump(path, finalEvent),
    );
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, scope: Scope): Promise<void> {
    event.tags = { event_type: 'javascript', ...event.tags };
    await super.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(
    breadcrumb: Breadcrumb,
    scope: Scope,
  ): Promise<void> {
    await super.addBreadcrumb(breadcrumb, scope);
  }

  /**
   * @inheritDoc
   */
  public async setContext(nextContext: Context, scope: Scope): Promise<void> {
    await super.setContext(nextContext, scope);
  }

  /**
   * @inheritDoc
   */
  protected async prepareEvent(
    event: SentryEvent,
    scope: Scope,
  ): Promise<SentryEvent> {
    const prepared = await super.prepareEvent(event, scope);
    const merged = await addEventDefaults(prepared);
    return normalizeEvent(merged);
  }
}
