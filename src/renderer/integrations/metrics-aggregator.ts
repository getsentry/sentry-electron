import { BrowserClient } from '@sentry/browser';
import { convertIntegrationFnToClass } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { ElectronRendererMetricsAggregator } from '../metrics';

const INTEGRATION_NAME = 'MetricsAggregator';

const metricsAggregatorIntegration: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
    setup(client: BrowserClient) {
      client.metricsAggregator = new ElectronRendererMetricsAggregator();
    },
  };
};

/**
 * Enables Sentry metrics monitoring.
 *
 * @experimental This API is experimental and might having breaking changes in the future.
 */
// eslint-disable-next-line deprecation/deprecation
export const MetricsAggregator = convertIntegrationFnToClass(INTEGRATION_NAME, metricsAggregatorIntegration);
