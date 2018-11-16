import { BaseClient, Scope } from '@sentry/core';
import { Breadcrumb, SentryBreadcrumbHint, SentryEvent, SentryEventHint, SentryResponse } from '@sentry/types';
import { CommonClient, ElectronOptions } from '../common';
import { SDK_NAME } from '../sdk';
import { MainBackend } from './backend';
import { addEventDefaults } from './context';
import { normalizeEvent } from './normalize';

/** SDK version used in every event. */
// tslint:disable-next-line
export const SDK_VERSION: string = require('../../package.json').version;

/** Frontend implementation for Electron renderer backends. */
export class MainClient extends BaseClient<MainBackend, ElectronOptions> implements CommonClient {
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
  protected async prepareEvent(event: SentryEvent, scope?: Scope, hint?: SentryEventHint): Promise<SentryEvent | null> {
    event.platform = event.platform || 'node';
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/electron',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    // We need to load the options here and set release from options
    // Otherwise addEventDefaults will add default values there
    const { environment, release, dist } = this.getOptions();
    const prepared = { ...event };

    if (prepared.environment === undefined && environment !== undefined) {
      prepared.environment = environment;
    }
    if (prepared.release === undefined && release !== undefined) {
      prepared.release = release;
    }

    if (prepared.dist === undefined && dist !== undefined) {
      prepared.dist = dist;
    }

    return super.prepareEvent(normalizeEvent(await addEventDefaults(prepared)), scope, hint);
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope Optional SDK scope used to upload.
   */
  public async captureMinidump(path: string, event: SentryEvent = {}, scope?: Scope): Promise<void> {
    event.tags = { event_type: 'native', ...event.tags };
    await this.processEvent(event, async finalEvent => this.getBackend().uploadMinidump(path, finalEvent), {}, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, hint?: SentryEventHint, scope?: Scope): Promise<SentryResponse> {
    event.tags = { event_type: 'javascript', ...event.tags };
    return super.captureEvent(event, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: SentryBreadcrumbHint, scope?: Scope): void {
    super.addBreadcrumb(breadcrumb, hint, scope);
  }

  /**
   * Does nothing in main/node
   */
  public showReportDialog(_: any): void {
    // noop
  }
}
