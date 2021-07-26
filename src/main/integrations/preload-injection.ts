import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app, Session, session } from 'electron';
import { existsSync } from 'fs';

import { rendererRequiresCrashReporterStart } from '../electron-normalize';

/**
 * Injects the preload script into the provided sessions.
 *
 * Defaults to injecting into the defaultSession
 */
export class PreloadInjection implements Integration {
  /** @inheritDoc */
  public static id: string = 'PreloadInjection';

  /** @inheritDoc */
  public name: string = PreloadInjection.id;

  public constructor(private readonly _getSessions: () => Session[] = () => [session.defaultSession]) {}

  /** @inheritDoc */
  public setupOnce(): void {
    app.once('ready', () => {
      this._addPreloadToSessions();
    });
  }

  /**
   * Attempts to add the preload script the the provided sessions
   */
  private _addPreloadToSessions(): void {
    let path = undefined;
    try {
      path = rendererRequiresCrashReporterStart()
        ? require.resolve('../../preload/legacy.js')
        : require.resolve('../../preload/index.js');
    } catch (_) {
      //
    }

    if (path && typeof path === 'string' && existsSync(path)) {
      for (const sesh of this._getSessions()) {
        // Fetch any existing preloads so we don't overwrite them
        const existing = sesh.getPreloads();
        sesh.setPreloads([path, ...existing]);
      }
    } else {
      logger.log(
        'The preload script could not be injected automatically. This is most likely caused by bundling of the main process',
      );
    }
  }
}
