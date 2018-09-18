import { getCurrentHub } from '@sentry/node';
import { Integration, SentryEvent } from '@sentry/types';
import { SDK_NAME } from '../../sdk';

/** SDK version used in every event. */
// tslint:disable-next-line
export const SDK_VERSION: string = require('../../../package.json').version;

/** Adds SDK info to an event. */
export class SDKInformation implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'SDKInformationElectron';

  /**
   * @inheritDoc
   */
  public install(): void {
    getCurrentHub().configureScope(scope => {
      scope.addEventProcessor(async (event: SentryEvent) => ({
        ...event,
        sdk: {
          name: SDK_NAME,
          packages: [
            ...((event.sdk && event.sdk.packages) || []),
            {
              name: 'npm:@sentry/node',
              version: SDK_VERSION,
            },
          ],
          version: SDK_VERSION,
        },
      }));
    });
  }
}
