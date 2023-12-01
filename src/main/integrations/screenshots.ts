import { BaseTransportOptions, Client, ClientOptions, Event, EventHint, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { BrowserWindow } from 'electron';

import { capturePage } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

/** Adds Screenshots to events */
export class Screenshots implements Integration {
  /** @inheritDoc */
  public static id: string = 'Screenshots';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = Screenshots.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    //
  }

  /** @inheritDoc */
  public async processEvent(
    event: Event,
    hint: EventHint,
    client: Client<ClientOptions<BaseTransportOptions>>,
  ): Promise<Event | null> {
    const attachScreenshot = !!(client.getOptions() as ElectronMainOptions).attachScreenshot;

    if (!attachScreenshot) {
      return event;
    }

    // We don't capture screenshots for transactions or native crashes
    if (!event.transaction && event.platform !== 'native') {
      let count = 1;

      for (const window of BrowserWindow.getAllWindows()) {
        if (!hint.attachments) {
          hint.attachments = [];
        }

        try {
          if (!window.isDestroyed() && window.isVisible()) {
            const filename = count === 1 ? 'screenshot.png' : `screenshot-${count}.png`;
            const image = await capturePage(window);

            hint.attachments.push({ filename, data: image.toPNG(), contentType: 'image/png' });

            count += 1;
          }
        } catch (e) {
          // Catch all errors so we don't break event submission if something goes wrong
          logger.error('Error capturing screenshot', e);
        }
      }
    }

    return event;
  }
}
