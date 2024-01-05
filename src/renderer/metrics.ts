import { MeasurementUnit, MetricsAggregator, Primitive } from '@sentry/types';

import { IPCInterface } from '../common/ipc';
import { getIPC } from './ipc';

/**
 * Sends metrics to the Electron main process where they can be aggregated in a single process
 */
export class ElectronRendererMetricsAggregator implements MetricsAggregator {
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
