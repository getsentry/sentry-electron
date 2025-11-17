import {
  _INTERNAL_captureMetric,
  getClient,
  getCurrentScope,
  MetricOptions,
  MetricType,
  SerializedMetric,
} from '@sentry/core';
import { getIPC } from './ipc.js';

function captureMetric(type: MetricType, name: string, value: number, options?: MetricOptions): void {
  const client = getClient();
  _INTERNAL_captureMetric(
    { type, name, value, unit: options?.unit, attributes: options?.attributes },
    {
      scope: options?.scope ?? getCurrentScope(),
      captureSerializedMetric: (_: unknown, metric: SerializedMetric) => getIPC(client).sendMetric(metric),
    },
  );
}

/**
 * @summary Increment a counter metric. Requires the `_experiments.enableMetrics` option to be enabled.
 *
 * @param name - The name of the counter metric.
 * @param value - The value to increment by (defaults to 1).
 * @param options - Options for capturing the metric.
 *
 * @example
 *
 * ```
 * Sentry.metrics.count('api.requests', 1, {
 *   attributes: {
 *     endpoint: '/api/users',
 *     method: 'GET',
 *     status: 200
 *   }
 * });
 * ```
 *
 * @example With custom value
 *
 * ```
 * Sentry.metrics.count('items.processed', 5, {
 *   attributes: {
 *     processor: 'batch-processor',
 *     queue: 'high-priority'
 *   }
 * });
 * ```
 */
export function count(name: string, value: number = 1, options?: MetricOptions): void {
  captureMetric('counter', name, value, options);
}

/**
 * @summary Set a gauge metric to a specific value. Requires the `_experiments.enableMetrics` option to be enabled.
 *
 * @param name - The name of the gauge metric.
 * @param value - The current value of the gauge.
 * @param options - Options for capturing the metric.
 *
 * @example
 *
 * ```
 * Sentry.metrics.gauge('memory.usage', 1024, {
 *   unit: 'megabyte',
 *   attributes: {
 *     process: 'web-server',
 *     region: 'us-east-1'
 *   }
 * });
 * ```
 *
 * @example Without unit
 *
 * ```
 * Sentry.metrics.gauge('active.connections', 42, {
 *   attributes: {
 *     server: 'api-1',
 *     protocol: 'websocket'
 *   }
 * });
 * ```
 */
export function gauge(name: string, value: number, options?: MetricOptions): void {
  captureMetric('gauge', name, value, options);
}

/**
 * @summary Record a value in a distribution metric. Requires the `_experiments.enableMetrics` option to be enabled.
 *
 * @param name - The name of the distribution metric.
 * @param value - The value to record in the distribution.
 * @param options - Options for capturing the metric.
 *
 * @example
 *
 * ```
 * Sentry.metrics.distribution('task.duration', 500, {
 *   unit: 'millisecond',
 *   attributes: {
 *     task: 'data-processing',
 *     priority: 'high'
 *   }
 * });
 * ```
 *
 * @example Without unit
 *
 * ```
 * Sentry.metrics.distribution('batch.size', 100, {
 *   attributes: {
 *     processor: 'batch-1',
 *     type: 'async'
 *   }
 * });
 * ```
 */
export function distribution(name: string, value: number, options?: MetricOptions): void {
  captureMetric('distribution', name, value, options);
}
