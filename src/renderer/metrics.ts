import type { MetricData } from '@sentry/core';
import { DurationUnit, MeasurementUnit, metrics as metricsCore, MetricsAggregator, Primitive } from '@sentry/core';

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
 * @deprecated — The Sentry metrics beta has ended. This method will be removed in a future release
 */
function increment(name: string, value: number = 1, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.increment(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @deprecated — The Sentry metrics beta has ended. This method will be removed in a future release
 */
function distribution(name: string, value: number, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.distribution(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @deprecated — The Sentry metrics beta has ended. This method will be removed in a future release
 */
function set(name: string, value: number | string, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.set(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @deprecated — The Sentry metrics beta has ended. This method will be removed in a future release
 */
function gauge(name: string, value: number, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.gauge(ElectronRendererMetricsAggregator, name, value, data);
}

/**
 * Adds a timing metric.
 * The metric is added as a distribution metric.
 *
 * You can either directly capture a numeric `value`, or wrap a callback function in `timing`.
 * In the latter case, the duration of the callback execution will be captured as a span & a metric.
 *
 * @deprecated — The Sentry metrics beta has ended. This method will be removed in a future release
 */
function timing(name: string, value: number, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): void;
function timing<T>(name: string, callback: () => T, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): T;
function timing<T = void>(
  name: string,
  value: number | (() => T),
  unit: DurationUnit = 'second',
  data?: Omit<MetricData, 'unit'>,
): T | void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.timing(ElectronRendererMetricsAggregator, name, value, unit, data);
}

/**
 * @deprecated — The Sentry metrics beta has ended. This will be removed in a future release
 */
export const metrics = {
  increment,
  distribution,
  set,
  gauge,
  timing,
};
