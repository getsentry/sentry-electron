import type { Event, SerializedStreamedSpan, Span, StartSpanOptions } from '@sentry/core';
import {
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setMeasurement,
  startSpanManual,
  timestampInSeconds,
} from '@sentry/core';
import { app } from 'electron';
import { flushSpanEnvelopeBuffer, ipcMainHooks, startSpanEnvelopeBuffering } from '../ipc.js';
import { applyStreamedRendererSpans, parseStatus } from './streamed-renderer-spans.js';

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
      // Buffer streamed span envelopes from renderers until we know whether they contain pageload
      // spans that need to be merged into the startup trace
      startSpanEnvelopeBuffering();

      let fallbackTimeoutFired = false;

      const fallbackTimeout = setTimeout(
        () => {
          fallbackTimeoutFired = true;
          flushSpanEnvelopeBuffer();

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
          // If the fallback timeout already fired, the startup span has ended and the envelope
          // buffer has been flushed. Merging renderer spans now would attach them to a finished
          // span and remove them from the envelopes that carry them, so we leave any streamed
          // spans to pass straight through to the transport instead.
          if (fallbackTimeoutFired) {
            return;
          }

          clearTimeout(fallbackTimeout);

          const parentSpan = rootTransaction();

          zeroLengthSpan({
            name: 'dom-ready',
            op: 'electron.web-contents.dom-ready',
          });

          let lastEndTimestamp = timestampInSeconds();

          const pageload = await waitForRendererPageload((options.timeoutSeconds || 10) * 1000);

          // Streamed span envelopes are buffered while we wait for the renderer pageload. If the
          // wait timed out, forward any buffered envelopes to the transport.
          flushSpanEnvelopeBuffer();

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
