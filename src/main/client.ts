import { BaseClient, Scope } from '@sentry/core';
import { Event, EventHint } from '@sentry/types';
import { logger, SyncPromise } from '@sentry/utils';

import { ElectronClient, ElectronOptions, SDK_NAME } from '../common';
import { MainBackend } from './backend';
import { addEventDefaults } from './context';
import { normalizeEvent } from './normalize';

/** SDK version used in every event. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const SDK_VERSION: string = require('../../package.json').version;

/** Frontend implementation for Electron renderer backends. */
export class MainClient extends BaseClient<MainBackend, ElectronOptions> implements ElectronClient {
  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    super(MainBackend, options);
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope Optional SDK scope used to upload.
   */
  public captureMinidump(path: string, event: Event = {}, scope?: Scope): string | undefined {
    let eventId: string | undefined;

    this._processing += 1;

    event.tags = { event_type: 'native', ...event.tags };

    // We are not calling _processEvent here since we do not have beforeSend for minidump crashes
    this._prepareEvent(event, scope, undefined).then(
      finalEvent => {
        if (finalEvent) {
          eventId = finalEvent && finalEvent.event_id;
          this._getBackend().uploadMinidump(path, finalEvent);
        }
        this._processing -= 1;
      },
      reason => {
        logger.error(reason);
        this._processing -= 1;
      },
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    event.tags = { event_type: 'javascript', ...event.tags };
    return super.captureEvent(event, hint, scope);
  }

  /**
   * Does nothing in main/node
   */
  public showReportDialog(_: unknown): void {
    // noop
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
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

    return super._prepareEvent(event, scope, hint).then((filledEvent: Event | null) =>
      new SyncPromise<Event>(async resolve => {
        if (filledEvent) {
          resolve(normalizeEvent(await addEventDefaults(this._options.appName, filledEvent)));
        } else {
          resolve(filledEvent);
        }
      }).then((e: Event | null) => e),
    );
  }
}
