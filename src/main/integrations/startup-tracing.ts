import {
  defineIntegration,
  Event,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setMeasurement,
  Span,
  SpanStatus,
  startSpanManual,
  StartSpanOptions,
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

function waitForRendererPageload(timeout: number): Promise<Event | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(undefined);
    }, timeout);
    ipcMainHooks.once('pageload-transaction', (event, _contents) => {
      clearTimeout(timer);
      resolve(event);
    });
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
      const fallbackTimeout = setTimeout(() => {
        const transaction = rootTransaction();
        transaction.setStatus({ code: 2, message: 'Timeout exceeded' });
        transaction.end();
      }, (options.timeoutSeconds || 10) * 1000);

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

          const event = await waitForRendererPageload((options.timeoutSeconds || 10) * 1000);

          lastEndTimestamp = applyRendererSpansAndMeasurements(parentSpan, event, lastEndTimestamp);

          parentSpan.end(lastEndTimestamp * 1000);
        });
      });
    },
  };
});
