import { getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, EventHint, EventProcessor, Integration } from '@sentry/types';
import { BrowserWindow } from 'electron';

import { capturePage } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

/** Adds Screenshots to events */
export class Screenshots implements Integration {
  /** @inheritDoc */
  public static id: string = 'Screenshots';

  /** @inheritDoc */
  public name: string = Screenshots.id;

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    const attachScreenshot = !!(getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions)
      .attachScreenshot;

    if (attachScreenshot) {
      addGlobalEventProcessor(async (event: Event, hint: EventHint) => {
        // We don't capture screenshots for transactions or native crashes
        if (!event.transaction && event.platform !== 'native') {
          let count = 1;

          for (const window of BrowserWindow.getAllWindows()) {
            if (!hint.attachments) {
              hint.attachments = [];
            }

            try {
              if (!window.isDestroyed()) {
                const screenshot = (await capturePage(window)).toPNG();

                hint.attachments.push({
                  filename: count === 1 ? 'screenshot.png' : `screenshot-${count}.png`,
                  data: screenshot,
                  contentType: 'image/png',
                });

                count += 1;
              }
            } catch (_) {
              // Ignore all errors so we don't break event submission if something goes wrong
            }
          }
        }

        return event;
      });
    }
  }
}
