import { addBreadcrumb, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Breadcrumb, Integration } from '@sentry/types';
import { app, autoUpdater, BrowserWindow, powerMonitor, screen, WebContents } from 'electron';

import { whenAppReady } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

/** A function that returns true if the named event should create breadcrumbs */
type EventFunction = (name: string) => boolean;
type EventTypes = boolean | string[] | EventFunction | undefined;

interface ElectronBreadcrumbsOptions<T> {
  /**
   * app events
   *
   * default: (name) => !name.startsWith('remote-')
   */
  app: T;
  /**
   * autoUpdater events
   *
   * default: all
   */
  autoUpdater: T;
  /**
   * webContents events
   * default: ['dom-ready', 'context-menu', 'load-url', 'destroyed']
   */
  webContents: T;
  /**
   * BrowserWindow events
   *
   * default: ['closed', 'close', 'unresponsive', 'responsive', 'show', 'blur', 'focus', 'hide',
   *            'maximize', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen' ]
   */
  browserWindow: T;
  /**
   * screen events
   *
   * default: all
   */
  screen: T;
  /**
   * powerMonitor events
   *
   * default: all
   */
  powerMonitor: T;
}

const DEFAULT_OPTIONS: ElectronBreadcrumbsOptions<EventFunction> = {
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

/** Converts all user supplied options to function | false */
export function normalizeOptions(
  options: Partial<ElectronBreadcrumbsOptions<EventTypes>>,
): Partial<ElectronBreadcrumbsOptions<EventFunction | false>> {
  return (Object.keys(options) as (keyof ElectronBreadcrumbsOptions<EventTypes>)[]).reduce((obj, k) => {
    const val: EventTypes = options[k];
    if (Array.isArray(val)) {
      obj[k] = (name) => val.includes(name);
    } else if (typeof val === 'function' || val === false) {
      obj[k] = val;
    }
    return obj;
  }, {} as Partial<ElectronBreadcrumbsOptions<EventFunction | false>>);
}

/** Adds breadcrumbs for Electron events. */
export class ElectronBreadcrumbs implements Integration {
  /** @inheritDoc */
  public static id: string = 'ElectronBreadcrumbs';

  /** @inheritDoc */
  public name: string = ElectronBreadcrumbs.id;

  private readonly _options: ElectronBreadcrumbsOptions<EventFunction | false>;

  /**
   * @param _options Integration options
   */
  public constructor(options: Partial<ElectronBreadcrumbsOptions<EventTypes>> = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...normalizeOptions(options) };
  }

  /** @inheritDoc */
  public setupOnce(): void {
    const initOptions = getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions | undefined;

    void whenAppReady.then(() => {
      // We can't access these until app 'ready'
      if (this._options.screen) {
        this._patchEventEmitter(screen, 'screen', this._options.screen);
      }

      if (this._options.powerMonitor) {
        this._patchEventEmitter(powerMonitor, 'powerMonitor', this._options.powerMonitor);
      }
    });

    if (this._options.app) {
      this._patchEventEmitter(app, 'app', this._options.app);
    }

    if (this._options.autoUpdater) {
      this._patchEventEmitter(autoUpdater, 'autoUpdater', this._options.autoUpdater);
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
          this._patchEventEmitter(window, windowName, this._options.browserWindow);
        });
      });
    }

    if (this._options.webContents) {
      app.on('web-contents-created', (_, contents) => {
        // SetImmediate is required for contents.id to be correct in older versions of Electron
        // https://github.com/electron/electron/issues/12036
        setImmediate(() => {
          if (contents.isDestroyed()) {
            return;
          }

          const webContentsName = initOptions?.getRendererName?.(contents) || 'renderer';

          this._patchEventEmitter(contents, webContentsName, this._options.webContents);
        });
      });
    }
  }

  /**
   * Monkey patches the EventEmitter to capture breadcrumbs for the specified events. 🙈
   */
  private _patchEventEmitter(
    emitter: NodeJS.EventEmitter | WebContents | BrowserWindow,
    category: string,
    shouldCapture: EventFunction | undefined | false,
  ): void {
    const emit = emitter.emit.bind(emitter) as (event: string, ...args: unknown[]) => boolean;

    emitter.emit = (event: string, ...args: unknown[]) => {
      if (shouldCapture && shouldCapture(event)) {
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
