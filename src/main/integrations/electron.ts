import { getCurrentHub } from '@sentry/node';
import { Integration } from '@sentry/types';
import {
  app,
  powerMonitor,
  screen,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';
import { ElectronClient } from '../../dispatch';

/** Electron integration that cleans up the event. */
export class Electron implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Electron.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Electron';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this.instrumentBreadcrumbs('app', app);

    app.once('ready', () => {
      // We can't access these until 'ready'
      this.instrumentBreadcrumbs('Screen', screen);
      this.instrumentBreadcrumbs('PowerMonitor', powerMonitor);
    });

    app.on('web-contents-created', (_, contents) => {
      // SetImmediate is required for contents.id to be correct
      // https://github.com/electron/electron/issues/12036
      setImmediate(() => {
        const options = (getCurrentHub().getClient() as ElectronClient).getOptions();
        const customName = options.getRendererName && options.getRendererName(contents);

        this.instrumentBreadcrumbs(customName || `WebContents[${contents.id}]`, contents, [
          'dom-ready',
          'load-url',
          'destroyed',
        ]);
      });
    });
  }

  /**
   * Hooks into the Electron EventEmitter to capture breadcrumbs for the
   * specified events.
   */
  private instrumentBreadcrumbs(category: string, emitter: Electron.EventEmitter, events: string[] = []): void {
    type Emit = (event: string, ...args: any[]) => boolean;
    const emit = emitter.emit.bind(emitter) as Emit;

    emitter.emit = (event, ...args) => {
      if (events.length === 0 || events.indexOf(event) > -1) {
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
