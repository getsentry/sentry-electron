import { getCurrentHub } from '@sentry/core';
import { Integration } from '@sentry/types';
import {
  app,
  powerMonitor,
  screen,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';

import { ElectronClient } from '../../common';

/** Electron integration that cleans up the event. */
export class Electron implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Electron';

  /**
   * @inheritDoc
   */
  public name: string = Electron.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._instrumentBreadcrumbs('app', app, event => !event.startsWith('remote-'));

    app.once('ready', () => {
      // We can't access these until 'ready'
      this._instrumentBreadcrumbs('Screen', screen);
      this._instrumentBreadcrumbs('PowerMonitor', powerMonitor);
    });

    app.on('web-contents-created', (_, contents) => {
      // SetImmediate is required for contents.id to be correct
      // https://github.com/electron/electron/issues/12036
      setImmediate(() => {
        if (contents.isDestroyed()) {
          return;
        }

        const options = (getCurrentHub().getClient() as ElectronClient).getOptions();
        const customName = options.getRendererName && options.getRendererName(contents);

        this._instrumentBreadcrumbs(customName || `WebContents[${contents.id}]`, contents as any, event =>
          ['dom-ready', 'load-url', 'destroyed'].includes(event),
        );
      });
    });
  }

  /**
   * Hooks into the Electron EventEmitter to capture breadcrumbs for the
   * specified events.
   */
  private _instrumentBreadcrumbs(
    category: string,
    emitter: NodeJS.EventEmitter,
    shouldInclude?: (event: string) => boolean,
  ): void {
    type Emit = (event: string, ...args: unknown[]) => boolean;
    const emit = emitter.emit.bind(emitter) as Emit;

    emitter.emit = (event: string, ...args) => {
      if (shouldInclude === undefined || shouldInclude(event)) {
        const breadcrumb = {
          category: 'electron',
          message: `${category}.${event}`,
          timestamp: new Date().getTime() / 1000,
          type: 'ui',
        };
        const self = getCurrentHub().getIntegration(Electron);
        if (self) {
          getCurrentHub().addBreadcrumb(breadcrumb);
        }
      }

      return emit(event, ...args);
    };
  }
}
