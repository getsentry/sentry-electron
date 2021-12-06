import { Event, EventProcessor, Integration } from '@sentry/types';
import { app, screen as electronScreen } from 'electron';
import { CpuInfo, cpus } from 'os';

import { mergeEvents } from '../../common';
import { whenAppReady } from '../electron-normalize';

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

interface LazyDeviceContext {
  language?: string;
  screen_resolution?: string;
  screen_density?: number;
}

interface AdditionalDeviceContext extends LazyDeviceContext {
  memory_size?: number;
  free_memory?: number;
  processor_count?: number;
  cpu_description?: string;
  processor_frequency?: number;
  machine_arch?: string;
}

/** Adds Electron context to events and normalises paths. */
export class AdditionalContext implements Integration {
  /** @inheritDoc */
  public static id: string = 'AdditionalContext';

  /** @inheritDoc */
  public name: string = AdditionalContext.id;

  private readonly _options: AdditionalContextOptions;
  private _lazyDeviceContext: LazyDeviceContext = {};

  public constructor(options: Partial<AdditionalContextOptions> = {}) {
    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(async (event: Event) => this._addAdditionalContext(event));

    // Some metrics are only available after app ready so we lazily load them
    void whenAppReady.then(() => {
      const { language, screen } = this._options;

      if (language) {
        this._lazyDeviceContext.language = app.getLocale();
      }

      if (screen) {
        this._setPrimaryDisplayInfo();

        electronScreen.on('display-metrics-changed', () => {
          this._setPrimaryDisplayInfo();
        });
      }
    });
  }

  /** Adds additional context to event */
  private _addAdditionalContext(event: Event): Event {
    const device: AdditionalDeviceContext = this._lazyDeviceContext;

    const { memory, cpu } = this._options;

    if (memory) {
      const { total, free } = process.getSystemMemoryInfo();
      device.memory_size = total * 1024;
      device.free_memory = free * 1024;
    }

    if (cpu) {
      const cpuInfo: CpuInfo[] | undefined = cpus();
      if (cpuInfo && cpuInfo.length) {
        const firstCpu = cpuInfo[0];

        device.processor_count = cpuInfo.length;
        device.cpu_description = firstCpu.model;
        device.processor_frequency = firstCpu.speed;

        if (app.runningUnderARM64Translation) {
          device.machine_arch = 'arm64';
        }
      }
    }

    return mergeEvents(event, { contexts: { device: device as Record<string, string | number> } });
  }

  /** Sets the display info */
  private _setPrimaryDisplayInfo(): void {
    const display = electronScreen.getPrimaryDisplay();
    const width = Math.floor(display.size.width * display.scaleFactor);
    const height = Math.floor(display.size.height * display.scaleFactor);
    this._lazyDeviceContext.screen_density = display.scaleFactor;
    this._lazyDeviceContext.screen_resolution = `${width}x${height}`;
  }
}
