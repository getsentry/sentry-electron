import { defineIntegration, dropUndefinedKeys, Event } from '@sentry/core';
import { app } from 'electron';

interface Options {
  infoLevel: 'basic' | 'complete';
}

interface GpuContext extends Record<string, unknown> {
  name: string;
  active?: boolean;
  vendor_id?: string;
  vendor_name?: string;
  device_id?: string;
  driver_version?: string;
}

interface GpuDevice {
  active: boolean;
  deviceId: number;
  deviceString?: string;
  driverVendor?: string;
  driverVersion?: string;
  vendorId: number;
  vendorString?: string;
}

interface GpuInfoResult {
  gpuDevice: GpuDevice[];
}

function gpuDeviceToGpuContext(device: GpuDevice): GpuContext {
  return dropUndefinedKeys({
    name: device.deviceString || 'GPU',
    active: device.active,
    vendor_id: `0x${device.vendorId.toString(16)}`,
    vendor_name: device.vendorString,
    device_id: `0x${device.deviceId.toString(16)}`,
    driver_version: device.driverVersion,
  });
}

/**
 * Adds additional Electron context to events
 */
export const gpuContextIntegration = defineIntegration((options: Options = { infoLevel: 'basic' }) => {
  let gpuContextsPromise: Promise<GpuContext[]> | undefined;

  return {
    name: 'GpuContext',
    setup() {
      app.on('gpu-info-update', async () => {
        gpuContextsPromise = (app.getGPUInfo(options.infoLevel) as Promise<GpuInfoResult>).then((result) =>
          result.gpuDevice.map(gpuDeviceToGpuContext),
        );
      });
    },
    processEvent: async (event): Promise<Event> => {
      if (gpuContextsPromise) {
        const gpuContexts = await gpuContextsPromise;

        if (gpuContexts.length === 1) {
          event.contexts = { ...event.contexts, gpu: gpuContexts[0] };
        } else if (gpuContexts.length > 1) {
          event.contexts = { ...event.contexts };
          for (let i = 0; i < gpuContexts.length; i++) {
            const gpuContext = gpuContexts[i] as GpuContext;
            gpuContext.type = 'gpu';
            event.contexts[`gpu_${i + 1}`] = gpuContext;
          }
        }
      }

      return event;
    },
  };
});
