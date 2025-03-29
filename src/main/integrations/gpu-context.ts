import { defineIntegration, Event } from '@sentry/core';
import { app } from 'electron';

interface Options {
  /**
   * How much GPU information to request from Electron `app.getGPUInfo` API.
   * `complete` can take much longer to resolve so the default is `basic`.
   * - 'basic': Usually only the `vendor_id` and `device_id` but some platforms supply more.
   * - 'complete': More detailed information including full names and driver_version.
   */
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
  return {
    name: device.deviceString || 'GPU',
    active: device.active,
    vendor_id: `0x${device.vendorId.toString(16).padStart(4, '0')}`,
    vendor_name: device.vendorString,
    device_id: `0x${device.deviceId.toString(16).padStart(4, '0')}`,
    driver_version: device.driverVersion,
  };
}

/**
 * Adds GPU context to events
 */
export const gpuContextIntegration = defineIntegration((options: Options = { infoLevel: 'basic' }) => {
  let gpuContexts: GpuContext[] | undefined;

  return {
    name: 'GpuContext',
    processEvent: async (event): Promise<Event> => {
      if (gpuContexts === undefined) {
        const result = (await app.getGPUInfo(options.infoLevel)) as GpuInfoResult;
        gpuContexts = result.gpuDevice.map(gpuDeviceToGpuContext);
      }

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

      return event;
    },
  };
});
