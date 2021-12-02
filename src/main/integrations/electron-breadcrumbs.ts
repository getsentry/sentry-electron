import { addBreadcrumb, captureMessage, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Breadcrumb, Integration } from '@sentry/types';
import { app, autoUpdater, BrowserWindow, powerMonitor, screen, WebContents } from 'electron';

import { whenAppReady } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

/** A function that returns true if the named event should create breadcrumbs */
type EventFunction = (name: string) => boolean;
type EventTypes = boolean | string[] | EventFunction | undefined;

interface ElectronBreadcrumbsOptions<EventTypes> {
  /**
   * Whether webContents `unresponsive` events are captured as Sentry events
   *
   * default: true
   */
  unresponsive: boolean;
  /**
   * app events
   *
   * default: (name) => !name.startsWith('remote-')
   */
  app: EventTypes;
  /**
   * autoUpdater events
   *
   * default: all
   */
  autoUpdater: EventTypes;
  /**
   * webContents events
   * default: ['dom-ready', 'context-menu', 'load-url', 'destroyed']
   */
  webContents: EventTypes;
  /**
   * BrowserWindow events
   *
   * default: ['closed', 'close', 'unresponsive', 'responsive', 'show', 'blur', 'focus', 'hide',
   *            'maximize', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen' ]
   */
  browserWindow: EventTypes;
  /**
   * screen events
   *
   * default: all
   */
  screen: EventTypes;
  /**
   * powerMonitor events
   *
   * default: all
   */
  powerMonitor: EventTypes;
}

const defaults: ElectronBreadcrumbsOptions<EventFunction> = {
  unresponsive: true,
  // We exclude events starting with remote as they can be quite verbose
  app: (name) => !name.startsWith('remote-'),
  autoUpdater: () => true,
  webContents: (name) => ['dom-ready', 'context-menu', 'load-url', 'destroyed'].includes(name),
  browserWindow: (name) =>
    [
      'closed',
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
    ].includes(name),
  screen: () => true,
  powerMonitor: () => true,
};

/** Converts string[] to function and true | undefined to defaults function  */
function getOptionOrDefault(
  options: Partial<ElectronBreadcrumbsOptions<EventTypes>>,
  key: keyof ElectronBreadcrumbsOptions<EventTypes>,
): EventFunction | undefined {
  const input = options[key];
  if (Array.isArray(input)) {
    return (name) => input.includes(name);
  }

  if (input === true || input === undefined) {
    return defaults[key] as EventFunction;
  }

  return undefined;
}

/** Adds breadcrumbs for Electron events. */
export class ElectronBreadcrumbs implements Integration {
  /** @inheritDoc */
  public static id: string = 'ElectronBreadcrumbs';

  /** @inheritDoc */
  public name: string = ElectronBreadcrumbs.id;

  private readonly _options: ElectronBreadcrumbsOptions<EventFunction | undefined>;

  /**
   * @param _options Integration options
   */
  public constructor(options: Partial<ElectronBreadcrumbsOptions<EventTypes>> = {}) {
    this._options = {
      unresponsive: options.unresponsive != false,
      app: getOptionOrDefault(options, 'app'),
      autoUpdater: getOptionOrDefault(options, 'autoUpdater'),
      webContents: getOptionOrDefault(options, 'webContents'),
      browserWindow: getOptionOrDefault(options, 'browserWindow'),
      screen: getOptionOrDefault(options, 'screen'),
      powerMonitor: getOptionOrDefault(options, 'powerMonitor'),
    };
  }

  /** @inheritDoc */
  public setupOnce(): void {
    const initOptions = getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions | undefined;

    void whenAppReady.then(() => {
      // We can't access these until app 'ready'
      if (this._options.screen) {
        this._instrumentBreadcrumbs('screen', screen, (name) => this._options.screen?.(name));
      }

      if (this._options.powerMonitor) {
        this._instrumentBreadcrumbs('powerMonitor', powerMonitor, (name) => this._options.powerMonitor?.(name));
      }
    });

    if (this._options.app) {
      this._instrumentBreadcrumbs('app', app, (event) => this._options.app?.(event));
    }

    if (this._options.autoUpdater) {
      this._instrumentBreadcrumbs('autoUpdater', autoUpdater, (name) => this._options.autoUpdater?.(name));
    }

    if (this._options.browserWindow) {
      app.on('browser-window-created', (_, window) => {
        // SetImmediate is required for contents.id to be correct in older versions of Electron
        // https://github.com/electron/electron/issues/12036
        setImmediate(() => {
          if (window.isDestroyed()) {
            return;
          }
          const windowName = initOptions?.getRendererName?.(window.webContents) || 'window';
          this._instrumentBreadcrumbs(windowName, window, (name) => this._options.browserWindow?.(name));
        });
      });
    }

    if (this._options.webContents || this._options.unresponsive != false) {
      app.on('web-contents-created', (_, contents) => {
        // SetImmediate is required for contents.id to be correct in older versions of Electron
        // https://github.com/electron/electron/issues/12036
        setImmediate(() => {
          if (contents.isDestroyed()) {
            return;
          }

          const webContentsName = initOptions?.getRendererName?.(contents) || 'renderer';

          if (this._options.webContents) {
            this._instrumentBreadcrumbs(webContentsName, contents, (name) => this._options.webContents?.(name));
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
    emitter: NodeJS.EventEmitter | WebContents | BrowserWindow,
    shouldInclude: (event: string) => boolean | undefined,
  ): void {
    const emit = emitter.emit.bind(emitter) as (event: string, ...args: unknown[]) => boolean;

    emitter.emit = (event: string, ...args: unknown[]) => {
      if (shouldInclude(event)) {
        const breadcrumb: Breadcrumb = {
          category: 'electron',
          message: `${category}.${event}`,
          timestamp: new Date().getTime() / 1_000,
          type: 'ui',
        };

        if ('id' in emitter && !emitter.isDestroyed()) {
          breadcrumb.data = {
            id: emitter.id,
            title: emitter.getTitle(),
          };
        }

        addBreadcrumb(breadcrumb);
      }

      return emit(event, ...args);
    };
  }
}
