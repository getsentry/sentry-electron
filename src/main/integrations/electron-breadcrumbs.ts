import { addBreadcrumb, Breadcrumb, defineIntegration } from '@sentry/core';
import { logger, NodeClient } from '@sentry/node';
import { app, autoUpdater, BrowserWindow, powerMonitor, screen, WebContents } from 'electron';
import { getRendererProperties, trackRendererProperties } from '../renderers';
import { ElectronMainOptions } from '../sdk';

/** A function that returns true if the named event should create breadcrumbs */
type EventFunction = (name: string) => boolean;
type EventTypes = boolean | string[] | EventFunction | undefined;

export interface ElectronBreadcrumbsOptions<T> {
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

  /**
   * Whether to capture window titles with webContents/browserWindow breadcrumbs
   *
   * default: false
   */
  captureWindowTitles: boolean;
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
  captureWindowTitles: false,
};

/** Converts all user supplied options to function | false */
export function normalizeOptions(
  options: Partial<ElectronBreadcrumbsOptions<EventTypes>>,
): Partial<ElectronBreadcrumbsOptions<EventFunction | false>> {
  return (Object.keys(options) as (keyof ElectronBreadcrumbsOptions<EventTypes>)[]).reduce((obj, k) => {
    if (k === 'captureWindowTitles') {
      obj[k] = !!options[k];
    } else {
      const val: EventTypes = options[k];
      if (Array.isArray(val)) {
        obj[k] = (name) => val.includes(name);
      } else if (typeof val === 'function' || val === false) {
        obj[k] = val;
      }
    }

    return obj;
  }, {} as Partial<ElectronBreadcrumbsOptions<EventFunction | false>>);
}

/**
 * Adds breadcrumbs for Electron events.
 */
export const electronBreadcrumbsIntegration = defineIntegration(
  (userOptions: Partial<ElectronBreadcrumbsOptions<EventTypes>> = {}) => {
    const options: ElectronBreadcrumbsOptions<EventFunction | false> = {
      ...DEFAULT_OPTIONS,
      ...normalizeOptions(userOptions),
    };

    function patchEventEmitter(
      emitter: NodeJS.EventEmitter | WebContents | BrowserWindow,
      category: string,
      shouldCapture: EventFunction | undefined | false,
      id?: number | undefined,
    ): void {
      const emit = emitter.emit.bind(emitter) as (event: string, ...args: unknown[]) => boolean;

      emitter.emit = (event: string, ...args: unknown[]) => {
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        if (shouldCapture && shouldCapture(event)) {
          const breadcrumb: Breadcrumb = {
            category: 'electron',
            message: `${category}.${event}`,
            timestamp: new Date().getTime() / 1_000,
            type: 'ui',
          };

          if (id) {
            breadcrumb.data = { ...getRendererProperties(id) };

            if (!options.captureWindowTitles && breadcrumb.data?.title) {
              delete breadcrumb.data?.title;
            }
          }

          addBreadcrumb(breadcrumb);

          const attributes: Record<string, unknown> = {};

          if (breadcrumb.data?.id) {
            attributes.id = breadcrumb.data.id;
          }

          if (breadcrumb.data?.url) {
            attributes.url = breadcrumb.data.url;
          }

          logger.info(logger.fmt`electron.${category}.${event}`, attributes);
        }

        return emit(event, ...args);
      };
    }

    return {
      name: 'ElectronBreadcrumbs',
      setup(client: NodeClient) {
        const clientOptions = client.getOptions() as ElectronMainOptions | undefined;

        trackRendererProperties();

        app.whenReady().then(
          () => {
            // We can't access these until app 'ready'
            if (options.screen) {
              patchEventEmitter(screen, 'screen', options.screen);
            }

            if (options.powerMonitor) {
              patchEventEmitter(powerMonitor, 'powerMonitor', options.powerMonitor);
            }
          },
          () => {
            // ignore
          },
        );

        if (options.app) {
          patchEventEmitter(app, 'app', options.app);
        }

        if (options.autoUpdater) {
          patchEventEmitter(autoUpdater, 'autoUpdater', options.autoUpdater);
        }

        if (options.browserWindow) {
          app.on('browser-window-created', (_, window) => {
            const id = window.webContents.id;
            const windowName = clientOptions?.getRendererName?.(window.webContents) || 'window';
            patchEventEmitter(window, windowName, options.browserWindow, id);
          });
        }

        if (options.webContents) {
          app.on('web-contents-created', (_, contents) => {
            const id = contents.id;
            const webContentsName = clientOptions?.getRendererName?.(contents) || 'renderer';
            patchEventEmitter(contents, webContentsName, options.webContents, id);
          });
        }
      },
    };
  },
);
