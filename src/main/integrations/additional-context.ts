import { defineIntegration, DeviceContext } from '@sentry/core';
import { app, screen as electronScreen } from 'electron';
import { exec } from 'node:child_process';

import { mergeEvents } from '../merge';

export interface AdditionalContextOptions {
  /**
   * Capture dimensions and resolution of the primary display
   * @default true
   */
  screen: boolean;
  /**
   * Capture device model and manufacturer.
   * Only supported in Windows.
   * @default false
   */
  deviceModelManufacturer: boolean;
}

const DEFAULT_OPTIONS: AdditionalContextOptions = {
  screen: true,
  deviceModelManufacturer: false,
};

/** The Key properties we're looking for in the JSON we get back from the powershell command */
type CmiJson = {
  Manufacturer?: string;
  Model?: string;
};

function getWindowsDeviceModelManufacturer(): Promise<DeviceContext> {
  return new Promise((resolve) => {
    try {
      exec(
        'powershell -NoProfile "Get-CimInstance -ClassName Win32_ComputerSystem | ConvertTo-Json"',
        (error, stdout) => {
          if (error) {
            resolve({});
          }
          try {
            const details = JSON.parse(stdout) as CmiJson;
            if (details.Manufacturer || details.Model) {
              resolve({
                manufacturer: details.Manufacturer,
                model: details.Model,
              });
              return;
            }
          } catch (_) {
            resolve({});
          }
        },
      );
    } catch (_) {
      resolve({});
    }
  });
}

/**
 * Adds additional Electron context to events
 */
export const additionalContextIntegration = defineIntegration((userOptions: Partial<AdditionalContextOptions> = {}) => {
  const _lazyDeviceContext: DeviceContext = {};
  let shouldCaptureDeviceModelManufacturer = userOptions.deviceModelManufacturer;

  const options = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  };

  function setPrimaryDisplayInfo(): void {
    const display = electronScreen.getPrimaryDisplay();
    const width = Math.floor(display.size.width * display.scaleFactor);
    const height = Math.floor(display.size.height * display.scaleFactor);
    _lazyDeviceContext.screen_density = display.scaleFactor;
    _lazyDeviceContext.screen_resolution = `${width}x${height}`;
  }

  return {
    name: 'AdditionalContext',
    setup() {
      if (!options.screen) {
        return;
      }

      // Some metrics are only available after app ready so we lazily load them
      app.whenReady().then(
        () => {
          setPrimaryDisplayInfo();
          electronScreen.on('display-metrics-changed', () => {
            setPrimaryDisplayInfo();
          });
        },
        () => {
          // ignore
        },
      );
    },
    processEvent: async (event) => {
      if (process.platform === 'win32' && shouldCaptureDeviceModelManufacturer) {
        // Ensure we only fetch this once per session
        shouldCaptureDeviceModelManufacturer = false;

        const { manufacturer, model } = await getWindowsDeviceModelManufacturer();

        if (manufacturer || model) {
          _lazyDeviceContext.manufacturer = manufacturer;
          _lazyDeviceContext.model = model;
        }
      }

      return mergeEvents(event, { contexts: { device: _lazyDeviceContext } });
    },
  };
});
