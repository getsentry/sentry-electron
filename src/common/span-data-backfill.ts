import { hasSpanStreamingEnabled } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { applyOtelSpanData, backfillStreamedSpanDataFromOtel } from '@sentry/opentelemetry';

/**
 * Backfill Sentry span data (op, source, name, status) from OpenTelemetry semantic attributes, mirroring the
 * `@sentry/node` init. Channel-based instrumentation stamps OTel semantic attributes on native Sentry spans but
 * leaves the Sentry-convention fields (e.g. `sentry.op`) to be inferred.
 */
export function setupSpanDataBackfill(client: NodeClient): void {
  client.on('spanEnd', (span) => {
    applyOtelSpanData(span, { finalizeStatus: true });
  });

  if (hasSpanStreamingEnabled(client)) {
    client.on('preprocessSpan', backfillStreamedSpanDataFromOtel);
  }
}
