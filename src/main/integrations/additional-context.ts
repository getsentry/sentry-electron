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
   * No supported on Linux.
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
            //
          }
          resolve({});
        },
      );
    } catch (_) {
      resolve({});
    }
  });
}

type MacOSHwType = {
  machine_model?: string;
};

type MacOSJson = {
  SPHardwareDataType?: MacOSHwType[];
};

function getMacOSDeviceModelManufacturer(): Promise<DeviceContext> {
  return new Promise((resolve) => {
    try {
      exec('system_profiler SPHardwareDataType -json', (error, stdout) => {
        if (error) {
          resolve({});
        }
        try {
          const details = JSON.parse(stdout.trim()) as MacOSJson;
          if (details.SPHardwareDataType?.[0]?.machine_model) {
            resolve({
              manufacturer: 'Apple',
              model: details.SPHardwareDataType[0].machine_model,
            });
            return;
          }
        } catch (_) {
          //
        }
        resolve({});
      });
    } catch (_) {
      resolve({});
    }
  });
}

function getDeviceModelManufacturer(): Promise<DeviceContext> {
  if (process.platform === 'win32') {
    return getWindowsDeviceModelManufacturer();
  } else if (process.platform === 'darwin') {
    return getMacOSDeviceModelManufacturer();
  }

  return Promise.resolve({});
}

/**
 * Adds additional Electron context to events
 */
export const additionalContextIntegration = defineIntegration((userOptions: Partial<AdditionalContextOptions> = {}) => {
  const _lazyDeviceContext: DeviceContext = {};
  let captureDeviceModelManufacturer = userOptions.deviceModelManufacturer;

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

  async function setDeviceModelManufacturer(): Promise<void> {
    const { manufacturer, model } = await getDeviceModelManufacturer();

    if (manufacturer || model) {
      _lazyDeviceContext.manufacturer = manufacturer;
      _lazyDeviceContext.model = model;
    }
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
      if (captureDeviceModelManufacturer) {
        // Ensure we only fetch this once per session
        captureDeviceModelManufacturer = false;

        await setDeviceModelManufacturer();
      }

      return mergeEvents(event, { contexts: { device: _lazyDeviceContext } });
    },
  };
});
