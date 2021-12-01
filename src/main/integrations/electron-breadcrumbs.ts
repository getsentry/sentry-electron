import { addBreadcrumb, captureMessage, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Breadcrumb, Integration } from '@sentry/types';
import { app, powerMonitor, screen } from 'electron';

import { ElectronMainOptions } from '../sdk';

interface ElectronBreadcrumbsOptions {
  /** Whether webContents `unresponsive` events are captured as events */
  unresponsive?: boolean;
  app?: boolean;
  webContents?: boolean;
  /** Capture BrowserWindow events */
  window?: boolean;
  screen?: boolean;
  powerMonitor?: boolean;
}

/** Adds breadcrumbs for Electron events. */
export class ElectronBreadcrumbs implements Integration {
  /** @inheritDoc */
  public static id: string = 'ElectronBreadcrumbs';

  /** @inheritDoc */
  public name: string = ElectronBreadcrumbs.id;

  /**
   * @param _options Integration options
   */
  public constructor(private readonly _options: ElectronBreadcrumbsOptions = {}) {}

  /** @inheritDoc */
  public setupOnce(): void {
    const options = getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions | undefined;

    if (this._options.app != false) {
      this._instrumentBreadcrumbs('app', app, (event) => !event.startsWith('remote-'));
    }

    app.once('ready', () => {
      // We can't access these until 'ready'
      if (this._options.screen != false) {
        this._instrumentBreadcrumbs('Screen', screen);
      }
      if (this._options.powerMonitor != false) {
        this._instrumentBreadcrumbs('PowerMonitor', powerMonitor);
      }
    });

    if (this._options.window != false) {
      app.on('browser-window-created', (_, browserWindow) => {
        const windowName = options?.getRendererName?.(browserWindow.webContents) || 'window';

        this._instrumentBreadcrumbs(
          windowName,
          browserWindow,
          (event) =>
            [
              'close',
              'unresponsive',
              'responsive',
              'show',
              'blur',
              'focus',
              'hide',
              'maximize',
              'minimize',
              'restore',
              'enter-full-screen',
              'leave-full-screen',
            ].includes(event),
          () => ({ id: browserWindow.id, title: browserWindow.getTitle() }),
        );
      });
    }

    if (this._options.webContents != false || this._options.unresponsive != false) {
      app.on('web-contents-created', (_, contents) => {
        // SetImmediate is required for contents.id to be correct in older versions of Electron
        // https://github.com/electron/electron/issues/12036
        setImmediate(() => {
          if (contents.isDestroyed()) {
            return;
          }

          const webContentsName = options?.getRendererName?.(contents) || 'renderer';
          if (this._options.webContents != false) {
            this._instrumentBreadcrumbs(
              webContentsName,
              contents,
              (event) => ['dom-ready', 'load-url'].includes(event),
              () => ({ id: contents.id, title: contents.getTitle() }),
            );
          }

          if (this._options.unresponsive != false) {
            contents.on('unresponsive', () => {
              captureMessage(`${webContentsName} Unresponsive`);
            });
          }
        });
      });
    }
  }

  /**
   * Hooks into the Electron EventEmitter to capture breadcrumbs for the
   * specified events.
   */
  private _instrumentBreadcrumbs(
    category: string,
    emitter: NodeJS.EventEmitter,
    shouldInclude?: (event: string) => boolean,
    getData?: () => Record<string, any>,
  ): void {
    type Emit = (event: string, ...args: unknown[]) => boolean;
    const emit = emitter.emit.bind(emitter) as Emit;

    emitter.emit = (event: string, ...args) => {
      if (shouldInclude === undefined || shouldInclude(event)) {
        const breadcrumb: Breadcrumb = {
          category: 'electron',
          message: `${category}.${event}`,
          timestamp: new Date().getTime() / 1_000,
          type: 'ui',
        };

        if (getData) {
          breadcrumb.data = getData();
        }

        addBreadcrumb(breadcrumb);
      }

      return emit(event, ...args);
    };
  }
}
