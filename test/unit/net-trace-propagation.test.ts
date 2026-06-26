import { afterEach, describe, expect, test, vi } from 'vitest';

function createMockClientRequest(): any {
  const headers: Record<string, string> = {};
  return {
    getHeader: (name: string) => headers[name],
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    once: vi.fn().mockReturnThis(),
    _capturedHeaders: headers,
  };
}

let latestMockRequest: ReturnType<typeof createMockClientRequest>;
let latestOriginalRequestArgs: unknown[];

vi.mock('electron', () => ({
  net: {
    request: (...args: unknown[]) => {
      latestOriginalRequestArgs = args;
      latestMockRequest = createMockClientRequest();
      return latestMockRequest;
    },
  },
}));

import { net } from 'electron';
import { context, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  createTransport,
  getActiveSpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  resolvedSyncPromise,
  startSpan,
} from '@sentry/core';
import { getSentryResource, SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';
import { NodeClient, SentryContextManager, setNodeAsyncContextStrategy } from '@sentry/node';
import { electronNetIntegration } from '../../src/main/integrations/net-breadcrumbs';

const TEST_DSN = 'https://username@domain/123';
const NIL_TRACE_ID = '00000000000000000000000000000000';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

function setupSdk(options: Record<string, any> = {}): NodeClient {
  resetGlobals();
  setNodeAsyncContextStrategy();

  const client = new NodeClient({
    dsn: TEST_DSN,
    integrations: [electronNetIntegration()],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, (_) => resolvedSyncPromise({})),
    stackParser: () => [],
    tracePropagationTargets: [/.*/],
    ...options,
  });

  getCurrentScope().setClient(client);
  client.init();

  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: getSentryResource('node'),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [new SentrySpanProcessor()],
  });

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new SentryContextManager());

  return client;
}

function cleanupOtel(): void {
  trace.disable();
  context.disable();
  propagation.disable();
  resetGlobals();
}

describe('electron net trace header propagation', () => {
  afterEach(() => {
    cleanupOtel();
  });

  test('TWP mode: propagates valid trace ID from scope propagation context', () => {
    setupSdk();

    const scopeTraceId = getCurrentScope().getPropagationContext().traceId;
    expect(scopeTraceId).not.toBe(NIL_TRACE_ID);

    net.request('http://localhost:1234/test');

    const sentryTrace = latestMockRequest._capturedHeaders['sentry-trace'];
    expect(sentryTrace).toBeDefined();

    const [traceId] = sentryTrace.split('-');
    expect(traceId).toBe(scopeTraceId);
  });

  test('tracing enabled: propagates child span ID, not parent span ID', () => {
    setupSdk({ tracesSampleRate: 1.0 });

    startSpan({ name: 'parent-span' }, () => {
      const parentSpanId = getActiveSpan()!.spanContext().spanId;
      const parentTraceId = getActiveSpan()!.spanContext().traceId;

      net.request('http://localhost:1234/test');

      const sentryTrace = latestMockRequest._capturedHeaders['sentry-trace'];
      expect(sentryTrace).toBeDefined();

      const [traceId, spanId] = sentryTrace.split('-');
      expect(traceId).toBe(parentTraceId);
      expect(spanId).not.toBe(parentSpanId);
    });
  });

  test('preserves additional request arguments', () => {
    setupSdk();

    const responseCallback = vi.fn();

    (net.request as unknown as (options: string, callback: typeof responseCallback) => void)(
      'http://localhost:1234/test',
      responseCallback,
    );

    expect(latestOriginalRequestArgs).toHaveLength(2);
    expect(latestOriginalRequestArgs[1]).toBe(responseCallback);
  });
});
