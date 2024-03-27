import type { MetricData } from '@sentry/core';
import { metrics as metricsCore } from '@sentry/core';
import { MeasurementUnit, MetricsAggregator, Primitive } from '@sentry/types';

import { IPCInterface } from '../common/ipc';
import { getIPC } from './ipc';

/**
 * Sends metrics to the Electron main process where they can be aggregated in a single process
 */
class ElectronRendererMetricsAggregator implements MetricsAggregator {
  private readonly _ipc: IPCInterface;

  public constructor() {
    this._ipc = getIPC();
  }

  /** @inheritdoc */
  public add(
    metricType: 'c' | 'g' | 's' | 'd',
    name: string,
    value: string | number,
    unit?: MeasurementUnit | undefined,
    tags?: Record<string, Primitive> | undefined,
    timestamp?: number | undefined,
  ): void {
    this._ipc.sendAddMetric({ metricType, name, value, unit, tags, timestamp });
  }

  /** @inheritdoc */
  public flush(): void {
    // do nothing
  }

  /** @inheritdoc */
  public close(): void {
    // do nothing
  }

  /** @inheritdoc */
  public toString(): string {
    return '';
  }
}

/**
 * Adds a value to a counter metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function increment(name: string, value: number = 1, data?: MetricData): void {
  metricsCore.increment(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function distribution(name: string, value: number, data?: MetricData): void {
  metricsCore.distribution(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function set(name: string, value: number | string, data?: MetricData): void {
  metricsCore.set(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function gauge(name: string, value: number, data?: MetricData): void {
  metricsCore.gauge(ElectronRendererMetricsAggregator, name, value, data);
}

export const metrics = {
  increment,
  distribution,
  set,
  gauge,
};
