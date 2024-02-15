import { expect, should, use } from 'chai';
import * as http from 'http';
import chaiAsPromised = require('chai-as-promised');
// eslint-disable-next-line deprecation/deprecation
import { getActiveTransaction, setAsyncContextStrategy, Span, spanToJSON } from '@sentry/core';
import { createTransport, Hub, NodeClient } from '@sentry/node';
import { ClientOptions, Transaction, TransactionContext } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';
import { net } from 'electron';

import { Net } from '../../src/main/integrations/net-breadcrumbs';

// eslint-disable-next-line @typescript-eslint/unbound-method
const originalRequest = net.request;

should();
use(chaiAsPromised);

const TEST_SERVER_PORT = 8123;

function startServer(): http.Server<any, any> {
  return http
    .createServer(function (req, res) {
      const headersJson = JSON.stringify(req.headers);
      res.write(headersJson);
      res.end();
    })
    .listen(TEST_SERVER_PORT);
}

async function makeRequest(): Promise<Record<string, string>> {
  return net.fetch(`http://localhost:${TEST_SERVER_PORT}`).then((res) => res.json()) as Promise<Record<string, string>>;
}

function getDefaultNodeClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, (_) => resolvedSyncPromise({})),
    stackParser: () => [],
    instrumenter: 'sentry',
    ...options,
  };
}

function mockAsyncContextStrategy(getHub: () => Hub): void {
  function getCurrentHub(): Hub | undefined {
    return getHub();
  }

  function runWithAsyncContext<T>(fn: (hub: Hub) => T): T {
    return fn(getHub());
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}

function createHubOnScope(customOptions: Partial<ClientOptions> = {}): Hub {
  // eslint-disable-next-line deprecation/deprecation
  const hub = new Hub();
  mockAsyncContextStrategy(() => hub);

  const options = getDefaultNodeClientOptions({
    dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
    debug: true,
    tracesSampleRate: 1.0,
    release: '1.0.0',
    environment: 'production',
    ...customOptions,
  });

  // eslint-disable-next-line deprecation/deprecation
  hub.bindClient(new NodeClient(options));

  // eslint-disable-next-line deprecation/deprecation
  hub.getScope().setUser({
    id: 'uid123',
    segment: 'segmentA',
  });

  return hub;
}

function createTransactionOnScope(
  customOptions: Partial<ClientOptions> = {},
  customContext?: Partial<TransactionContext>,
): [Transaction, Hub] {
  const hub = createHubOnScope(customOptions);

  // eslint-disable-next-line deprecation/deprecation
  const transaction = hub.startTransaction({
    name: 'dogpark',
    traceId: '12312012123120121231201212312012',
    ...customContext,
  });

  // eslint-disable-next-line deprecation/deprecation
  hub.getScope().setSpan(transaction);

  return [transaction, hub];
}

function getSpans(transaction: Transaction): Span[] {
  // eslint-disable-next-line deprecation/deprecation
  return (transaction as unknown as Span).spanRecorder?.spans as Span[];
}

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('net integration', () => {
  let server: http.Server<any, any> | undefined;

  beforeEach(() => {
    net.request = originalRequest;
    server = startServer();
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('creates spans and adds headers by default', async () => {
    const [transaction] = createTransactionOnScope({ integrations: [new Net()] });
    const headers = await makeRequest();

    const spans = getSpans(transaction);
    expect(spans.length).to.equal(2);

    // our span is at index 1 because the transaction itself is at index 0
    expect(spanToJSON(spans[1]).description).to.equal(`GET http://localhost:${TEST_SERVER_PORT}/`);
    // eslint-disable-next-line deprecation/deprecation
    expect(spans[1].op).to.equal('http.client');

    expect(headers['sentry-trace']).not.to.be.empty;
  });

  describe('constructor options', () => {
    it('tracing = false disables spans and headers', async () => {
      const [transaction] = createTransactionOnScope({
        integrations: [new Net({ tracing: false })],
      });
      const headers = await makeRequest();

      const spans = getSpans(transaction);

      // We should have the original transaction span, but no request span
      expect(spans.length).to.equal(1);
      expect(headers['sentry-trace']).to.be.undefined;
    });

    it('tracing = fn can disable spans and headers', async () => {
      const [transaction] = createTransactionOnScope({
        integrations: [new Net({ tracing: () => false })],
      });
      const headers = await makeRequest();

      const spans = getSpans(transaction);

      // We should have the original transaction span, but no request span
      expect(spans.length).to.equal(1);
      expect(headers['sentry-trace']).to.be.undefined;
    });

    it('tracing = fn can enable spans and headers', async () => {
      const [transaction] = createTransactionOnScope({
        integrations: [new Net({ tracing: () => true })],
      });
      const headers = await makeRequest();

      const spans = getSpans(transaction);
      expect(spans.length).to.equal(2);

      // our span is at index 1 because the transaction itself is at index 0
      expect(spanToJSON(spans[1]).description).to.equal(`GET http://localhost:${TEST_SERVER_PORT}/`);
      // eslint-disable-next-line deprecation/deprecation
      expect(spans[1].op).to.equal('http.client');

      expect(headers['sentry-trace']).not.to.be.empty;
    });

    it('tracingOrigins = fn can disable headers', async () => {
      const [transaction] = createTransactionOnScope({
        integrations: [new Net({ tracing: () => true, tracingOrigins: () => false })],
      });
      const headers = await makeRequest();

      const spans = getSpans(transaction);
      expect(spans.length).to.equal(2);

      // our span is at index 1 because the transaction itself is at index 0
      expect(spanToJSON(spans[1]).description).to.equal(`GET http://localhost:${TEST_SERVER_PORT}/`);
      // eslint-disable-next-line deprecation/deprecation
      expect(spans[1].op).to.equal('http.client');

      expect(headers['sentry-trace']).to.be.undefined;
    });
  });

  describe('client options', () => {
    it('tracePropagationTargets can enable headers', async () => {
      const [transaction] = createTransactionOnScope({
        tracePropagationTargets: ['localhost'],
        integrations: [new Net()],
      });
      const headers = await makeRequest();

      const spans = getSpans(transaction);
      expect(spans.length).to.equal(2);

      // our span is at index 1 because the transaction itself is at index 0
      expect(spanToJSON(spans[1]).description).to.equal(`GET http://localhost:${TEST_SERVER_PORT}/`);
      // eslint-disable-next-line deprecation/deprecation
      expect(spans[1].op).to.equal('http.client');

      expect(headers['sentry-trace']).not.to.be.empty;
    });

    it('tracePropagationTargets can disable headers', async () => {
      const [transaction] = createTransactionOnScope({
        tracePropagationTargets: ['api.localhost'],
        integrations: [new Net()],
      });
      const headers = await makeRequest();

      const spans = getSpans(transaction);
      expect(spans.length).to.equal(2);

      // our span is at index 1 because the transaction itself is at index 0
      expect(spanToJSON(spans[1]).description).to.equal(`GET http://localhost:${TEST_SERVER_PORT}/`);
      // eslint-disable-next-line deprecation/deprecation
      expect(spans[1].op).to.equal('http.client');

      expect(headers['sentry-trace']).to.be.undefined;
    });
  });

  describe('tracing without performance', () => {
    it('adds headers without transaction', async () => {
      createHubOnScope({
        tracePropagationTargets: ['localhost'],
        integrations: [new Net()],
      });
      const headers = await makeRequest();
      // eslint-disable-next-line deprecation/deprecation
      const transaction = getActiveTransaction();

      expect(transaction).to.be.undefined;
      expect(headers['sentry-trace']).not.to.be.empty;
      expect(headers['baggage']).not.to.be.empty;
    });
  });
});
