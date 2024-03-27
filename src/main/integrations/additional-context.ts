import { defineIntegration } from '@sentry/core';
import { DeviceContext } from '@sentry/types';
import { app, screen as electronScreen } from 'electron';
import { CpuInfo, cpus } from 'os';

import { mergeEvents } from '../merge';

export interface AdditionalContextOptions {
  cpu: boolean;
  screen: boolean;
  memory: boolean;
  language: boolean;
}

const DEFAULT_OPTIONS: AdditionalContextOptions = {
  cpu: true,
  screen: true,
  memory: true,
  language: true,
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
          const { language, screen } = options;

          if (language) {
            _lazyDeviceContext.language = app.getLocale();
          }

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

      const { memory, cpu } = options;

      if (memory) {
        const { total, free } = process.getSystemMemoryInfo();
        device.memory_size = total * 1024;
        device.free_memory = free * 1024;
      }

      if (cpu) {
        const cpuInfo: CpuInfo[] | undefined = cpus();
        if (cpuInfo?.length) {
          const firstCpu = cpuInfo[0];

          device.processor_count = cpuInfo.length;
          device.cpu_description = firstCpu.model;
          device.processor_frequency = firstCpu.speed;

          if (app.runningUnderARM64Translation) {
            device.machine_arch = 'arm64';
          }
        }
      }

      return mergeEvents(event, { contexts: { device } });
    },
  };
});
