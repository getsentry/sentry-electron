import { defineIntegration } from '@sentry/core';
import { logger } from '@sentry/utils';
import { BrowserWindow } from 'electron';

/**
 * Captures and attaches screenshots to events
 */
export const screenshotsIntegration = defineIntegration(() => {
  return {
    name: 'Screenshots',
    async processEvent(event, hint) {
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
              const image = await window.capturePage();

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
    },
  };
});
