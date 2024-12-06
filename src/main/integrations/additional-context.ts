import { defineIntegration, DeviceContext } from '@sentry/core';
import { app, screen as electronScreen } from 'electron';

import { mergeEvents } from '../merge';

export interface AdditionalContextOptions {
  screen: boolean;
}

const DEFAULT_OPTIONS: AdditionalContextOptions = {
  screen: true,
};

/**
 * Adds additional Electron context to events
 */
export const additionalContextIntegration = defineIntegration((userOptions: Partial<AdditionalContextOptions> = {}) => {
  const _lazyDeviceContext: DeviceContext = {};

  const options = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  };

  function _setPrimaryDisplayInfo(): void {
    const display = electronScreen.getPrimaryDisplay();
    const width = Math.floor(display.size.width * display.scaleFactor);
    const height = Math.floor(display.size.height * display.scaleFactor);
    _lazyDeviceContext.screen_density = display.scaleFactor;
    _lazyDeviceContext.screen_resolution = `${width}x${height}`;
  }

  return {
    name: 'AdditionalContext',
    setup() {
      // Some metrics are only available after app ready so we lazily load them
      app.whenReady().then(
        () => {
          const { screen } = options;

          if (screen) {
            _setPrimaryDisplayInfo();

            electronScreen.on('display-metrics-changed', () => {
              _setPrimaryDisplayInfo();
            });
          }
        },
        () => {
          // ignore
        },
      );
    },
    processEvent(event) {
      const device: DeviceContext = _lazyDeviceContext;

      return mergeEvents(event, { contexts: { device } });
    },
  };
});
