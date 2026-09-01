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
import {
  createTransport,
  getActiveSpan,
  getCurrentScope,
  getMainCarrier,
  resolvedSyncPromise,
  SDK_VERSION,
  startSpan,
} from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import { electronNetIntegration } from '../../src/main/integrations/net-breadcrumbs';

const TEST_DSN = 'https://username@domain/123';
const NIL_TRACE_ID = '00000000000000000000000000000000';

function resetGlobals(): void {
  // Scope.clear() was removed in v11, so drop the scope singletons to force fresh scopes
  const sentryCarrier = getMainCarrier().__SENTRY__?.[SDK_VERSION];
  if (sentryCarrier) {
    delete sentryCarrier.globalScope;
    delete sentryCarrier.defaultCurrentScope;
    delete sentryCarrier.defaultIsolationScope;
  }
}

function setupSdk(options: Record<string, any> = {}): NodeClient {
  resetGlobals();
  const asyncLocalStorage = setAsyncLocalStorageAsyncContextStrategy();

  const client = new NodeClient({
    dsn: TEST_DSN,
    integrations: [electronNetIntegration()],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, (_) => resolvedSyncPromise({})),
    stackParser: () => [],
    tracePropagationTargets: [/.*/],
    ...options,
  });

  client.asyncLocalStorageLookup = { asyncLocalStorage };
  getCurrentScope().setClient(client);
  client.init();

  return client;
}

describe('electron net trace header propagation', () => {
  afterEach(() => {
    resetGlobals();
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
