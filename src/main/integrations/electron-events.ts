import { addBreadcrumb, captureMessage, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Integration } from '@sentry/types';
import { app, powerMonitor, screen } from 'electron';

import { ElectronMainOptions } from '../sdk';

/** Adds breadcrumbs for Electron events. */
export class ElectronEvents implements Integration {
  /** @inheritDoc */
  public static id: string = 'ElectronEvents';

  /** @inheritDoc */
  public name: string = ElectronEvents.id;

  /** @inheritDoc */
  public constructor(private readonly _unresponsive: boolean = true) {}

  /** @inheritDoc */
  public setupOnce(): void {
    const options = getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions | undefined;

    this._instrumentBreadcrumbs('app', app, (event) => !event.startsWith('remote-'));

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

        this._instrumentBreadcrumbs(
          options?.getRendererName?.(contents) || `WebContents[${contents.id}]`,
          contents,
          (event) => ['dom-ready', 'load-url', 'destroyed'].includes(event),
        );
      });

      if (this._unresponsive) {
        contents.on('unresponsive', () => {
          captureMessage('BrowserWindow Unresponsive');
        });
      }
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

        addBreadcrumb(breadcrumb);
      }

      return emit(event, ...args);
    };
  }
}
