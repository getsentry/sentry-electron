import type { Event, SerializedStreamedSpan, Span, SpanStatus, StartSpanOptions } from '@sentry/core';
import {
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setMeasurement,
  startSpanManual,
  timestampInSeconds,
} from '@sentry/core';
import { app } from 'electron';
import { ipcMainHooks } from '../ipc.js';

export interface StartupTracingOptions {
  /*
   * Timeout in seconds to wait before ending the startup transaction
   * Defaults to 10 seconds
   */
  timeoutSeconds?: number;
}

let cachedRootTransaction: Span | undefined;
/**
 * Creates the root startup span lazily because otel hasn't been configured when the integration is setup
 */
function rootTransaction(): Span {
  if (!cachedRootTransaction) {
    // Calculate the actual start time of the process
    const uptimeMs = process.uptime() * 1000;
    const startTime = (Date.now() - uptimeMs) / 1000;

    startSpanManual(
      {
        name: 'Startup',
        op: 'app.start',
        startTime,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.electron.startup',
        },
        forceTransaction: true,
      },
      (root) => {
        cachedRootTransaction = root;
      },
    );
  }

  return cachedRootTransaction as Span;
}

function zeroLengthSpan(options: StartSpanOptions): void {
  const startTime = timestampInSeconds();

  startSpanManual(
    {
      ...options,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.electron.startup',
        ...options.attributes,
      },
      parentSpan: options.parentSpan || rootTransaction(),
      startTime,
    },
    (span) => {
      span.end(startTime * 1000);
    },
  );
}

type RendererPageload = { event: Event } | { spans: SerializedStreamedSpan[] } | undefined;

function waitForRendererPageload(timeout: number): Promise<RendererPageload> {
  return new Promise((resolve) => {
    const onTransaction = (event: Event): void => finish({ event });
    const onSpans = (spans: SerializedStreamedSpan[]): void => finish({ spans });

    const timer = setTimeout(() => finish(undefined), timeout);

    function finish(result: RendererPageload): void {
      clearTimeout(timer);
      ipcMainHooks.removeListener('pageload-transaction', onTransaction);
      ipcMainHooks.removeListener('pageload-spans', onSpans);
      resolve(result);
    }

    ipcMainHooks.on('pageload-transaction', onTransaction);
    ipcMainHooks.on('pageload-spans', onSpans);
  });
}

function parseStatus(status: string): SpanStatus {
  if (status === 'ok') {
    return { code: 1 };
  }

  return { code: 2, message: status };
}

function applyRendererSpansAndMeasurements(parentSpan: Span, event: Event | undefined, endTimestamp: number): number {
  let lastEndTimestamp = endTimestamp;

  if (!event) {
    return lastEndTimestamp;
  }

  const rendererStartTime = event.start_timestamp || event.timestamp;
  parentSpan.setAttribute('performance.timeOrigin', rendererStartTime);

  startSpanManual(
    {
      name: event.transaction || 'electron.renderer',
      op: 'electron.renderer',
      startTime: rendererStartTime,
      parentSpan,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.electron.startup',
      },
    },
    (rendererSpan) => {
      if (event?.spans?.length) {
        for (const spanJson of event.spans) {
          const startTime = spanJson.start_timestamp;
          const endTime = spanJson.timestamp;

          if (endTime) {
            lastEndTimestamp = Math.max(lastEndTimestamp, endTime);
          }

          startSpanManual(
            {
              name: spanJson.description || 'electron.renderer',
              op: spanJson.op,
              startTime,
              attributes: spanJson.data,
              parentSpan: rendererSpan,
            },
            (span) => {
              if (spanJson.status) {
                span.setStatus(parseStatus(spanJson.status));
              }

              span.end((endTime || startTime) * 1000);
            },
          );
        }
      }

      rendererSpan.end(lastEndTimestamp * 1000);
    },
  );

  if (event.measurements) {
    for (const [name, measurement] of Object.entries(event.measurements)) {
      setMeasurement(name, measurement.value, measurement.unit, parentSpan);
    }
  }

  if (event.contexts?.trace?.data) {
    for (const [key, value] of Object.entries(event.contexts.trace.data)) {
      if (!['sentry.op', 'sentry.origin', 'performance.timeOrigin'].includes(key)) {
        parentSpan.setAttribute(key, value);
      }
    }
  }

  return lastEndTimestamp;
}

function streamedAttr(span: SerializedStreamedSpan, key: string): string | undefined {
  return span.attributes?.[key]?.value as string | undefined;
}

// Attributes on the streamed pageload segment that describe the renderer segment itself (its
// identity and SDK metadata) rather than the measurements and trace metadata (Web Vitals,
// connection/device info, etc.) that should be merged onto the startup span.
const NON_INHERITED_SEGMENT_ATTRIBUTES = new Set([
  'sentry.op',
  'sentry.origin',
  'sentry.source',
  'sentry.sample_rate',
  'sentry.segment.name',
  'sentry.segment.id',
  'sentry.sdk.name',
  'sentry.sdk.version',
  'sentry.sdk.integrations',
  'sentry.release',
  'sentry.environment',
  'sentry.span.source',
  'url.full',
  'http.request.header.user_agent',
]);

/**
 * Merges spans streamed from the renderer (when `traceLifecycle: 'stream'` is used) into the
 * startup span, mirroring {@link applyRendererSpansAndMeasurements} for the streamed span format.
 */
function applyStreamedRendererSpans(parentSpan: Span, spans: SerializedStreamedSpan[], endTimestamp: number): number {
  let lastEndTimestamp = endTimestamp;

  if (!spans.length) {
    return lastEndTimestamp;
  }

  const segment = spans.find((span) => span.is_segment);
  const childSpans = spans.filter((span) => !span.is_segment);

  const rendererStartTime = segment?.start_timestamp || timestampInSeconds();
  parentSpan.setAttribute('performance.timeOrigin', rendererStartTime);

  // Merge the renderer pageload measurements and trace metadata onto the startup span
  if (segment?.attributes) {
    for (const [key, attribute] of Object.entries(segment.attributes)) {
      if (!NON_INHERITED_SEGMENT_ATTRIBUTES.has(key)) {
        parentSpan.setAttribute(key, attribute.value);
      }
    }
  }

  startSpanManual(
    {
      name: segment?.name || 'electron.renderer',
      op: 'electron.renderer',
      startTime: rendererStartTime,
      parentSpan,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.electron.startup',
      },
    },
    (rendererSpan) => {
      for (const span of childSpans) {
        const startTime = span.start_timestamp;
        const endTime = span.end_timestamp;

        if (endTime) {
          lastEndTimestamp = Math.max(lastEndTimestamp, endTime);
        }

        startSpanManual(
          {
            name: span.name,
            op: streamedAttr(span, 'sentry.op'),
            startTime,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: streamedAttr(span, 'sentry.origin'),
            },
            parentSpan: rendererSpan,
          },
          (created) => {
            if (span.status) {
              created.setStatus(parseStatus(span.status));
            }

            created.end((endTime || startTime) * 1000);
          },
        );
      }

      rendererSpan.end(lastEndTimestamp * 1000);
    },
  );

  return lastEndTimestamp;
}

/**
 * An integration that instruments Electron's startup sequence.
 *
 * If you also use the `browserTracingIntegration` in the renderer process, the spans created in
 * the renderer will be included in the main process's startup transaction. This allows capturing
 * from main process start until the browser front-end is ready to use.
 *
 * Example:
 *
 * `main.mjs`
 * ```js
 * import { init, startupTracingIntegration } from '@sentry/electron/main';
 *
 * init({
 *   dsn: '__YOUR_DSN__',
 *   tracesSampleRate: 1.0,
 *   integrations: [startupTracingIntegration()],
 * });
 * ```
 * `renderer.mjs`
 * ```js
 * import { init, browserTracingIntegration } from '@sentry/electron/renderer';
 *
 * init({
 *   tracesSampleRate: 1.0,
 *   integrations: [browserTracingIntegration()],
 * });
 * ```
 */
export const startupTracingIntegration = defineIntegration((options: StartupTracingOptions = {}) => {
  return {
    name: 'StartupTracing',
    setup() {
      const fallbackTimeout = setTimeout(
        () => {
          const transaction = rootTransaction();
          transaction.setStatus({ code: 2, message: 'Timeout exceeded' });
          transaction.end();
        },
        (options.timeoutSeconds || 10) * 1000,
      );

      app.once('will-finish-launching', () => {
        zeroLengthSpan({
          name: 'will-finish-launching',
          op: 'electron.will-finish-launching',
        });
      });

      app.once('ready', () => {
        zeroLengthSpan({
          name: 'ready',
          op: 'electron.ready',
        });
      });

      app.once('web-contents-created', (_, webContents) => {
        zeroLengthSpan({
          name: 'web-contents-created',
          op: 'electron.web-contents.created',
        });

        webContents.once('dom-ready', async () => {
          clearTimeout(fallbackTimeout);

          const parentSpan = rootTransaction();

          zeroLengthSpan({
            name: 'dom-ready',
            op: 'electron.web-contents.dom-ready',
          });

          let lastEndTimestamp = timestampInSeconds();

          const pageload = await waitForRendererPageload((options.timeoutSeconds || 10) * 1000);

          if (pageload && 'spans' in pageload) {
            lastEndTimestamp = applyStreamedRendererSpans(parentSpan, pageload.spans, lastEndTimestamp);
          } else {
            lastEndTimestamp = applyRendererSpansAndMeasurements(parentSpan, pageload?.event, lastEndTimestamp);
          }

          parentSpan.end(lastEndTimestamp * 1000);
        });
      });
    },
  };
});
