import { Integrations } from '@sentry/node';
import { Primitive } from '@sentry/types';
import { app } from 'electron';

import { ELECTRON_MAJOR_VERSION } from '../electron-normalize';

/**
 * ConstructorParameters<typeof Integrations.Anr> doesn't work below because integration constructor types are broken here:
 * https://github.com/getsentry/sentry-javascript/blob/f28f3a968c52075694ecef4efef354f806fec100/packages/node/src/index.ts#L100-L116
 */
interface Options {
  /**
   * Interval to send heartbeat messages to the ANR worker.
   *
   * Defaults to 50ms.
   */
  pollInterval: number;
  /**
   * Threshold in milliseconds to trigger an ANR event.
   *
   * Defaults to 5000ms.
   */
  anrThreshold: number;
  /**
   * Whether to capture a stack trace when the ANR event is triggered.
   *
   * Defaults to `false`.
   *
   * This uses the node debugger which enables the inspector API and opens the required ports.
   */
  captureStackTrace: boolean;
  /**
   * Tags to include with ANR events.
   */
  staticTags: { [key: string]: Primitive };
  /**
   * @ignore Internal use only.
   *
   * If this is supplied, stack frame filenames will be rewritten to be relative to this path.
   */
  appRootPath: string | undefined;
}

// We can't use the functional style of integration until they are exported as functions...

/**
 * Starts a worker thread to detect App Not Responding (ANR) events
 */
export class Anr extends Integrations.Anr {
  public constructor(options: Partial<Options> = {}) {
    if (ELECTRON_MAJOR_VERSION < 15) {
      throw new Error('Main process ANR detection requires Electron >= v15');
    }

    super({
      ...options,
      staticTags: {
        'event.environment': 'javascript',
        'event.origin': 'electron',
        'event.process': 'browser',
        ...options.staticTags,
      },
      appRootPath: app.getAppPath(),
    });
  }
}
