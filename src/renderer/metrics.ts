import type { MetricData } from '@sentry/core';
import { metrics as metricsCore } from '@sentry/core';
import { DurationUnit, MeasurementUnit, MetricsAggregator, Primitive } from '@sentry/types';

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

/**
 * Adds a timing metric.
 * The metric is added as a distribution metric.
 *
 * You can either directly capture a numeric `value`, or wrap a callback function in `timing`.
 * In the latter case, the duration of the callback execution will be captured as a span & a metric.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function timing(name: string, value: number, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): void;
function timing<T>(name: string, callback: () => T, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): T;
function timing<T = void>(
  name: string,
  value: number | (() => T),
  unit: DurationUnit = 'second',
  data?: Omit<MetricData, 'unit'>,
): T | void {
  metricsCore.timing(ElectronRendererMetricsAggregator, name, value, unit, data);
}

export const metrics = {
  increment,
  distribution,
  set,
  gauge,
  timing,
};
