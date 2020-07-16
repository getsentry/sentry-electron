import { injectReportDialog, ReportDialogOptions } from '@sentry/browser/esm/helpers';
import { SDK_NAME, SDK_VERSION } from '@sentry/browser/esm/version';
import { BaseClient, getCurrentHub, Scope } from '@sentry/core';
import { Event, EventHint } from '@sentry/types';
import { logger } from '@sentry/utils';

import { ElectronClient, ElectronOptions } from '../common';

import { RendererBackend } from './backend';

/** Frontend implementation for Electron renderer backends. */
export class RendererClient extends BaseClient<RendererBackend, ElectronOptions> implements ElectronClient {
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
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
    event.platform = event.platform || 'javascript';
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/browser',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };
    return super._prepareEvent(event, scope, hint);
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope The SDK scope used to upload.
   */
  public captureMinidump(): string | undefined {
    logger.warn('captureMinidump is a noop on the renderer');
    return undefined;
  }

  /**
   * Basically calling {@link BrowserClient.showReportDialog}
   * @inheritdoc
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
    if (!options.eventId) {
      options.eventId = getCurrentHub().lastEventId();
    }
    injectReportDialog(options);
  }
}
