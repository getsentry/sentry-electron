import type { TransportMakeRequestResponse } from '@sentry/core';
import { createEventEnvelope } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { decodeEnvelopeDeliveryStatus, envelopeDeliveryStatus, NOT_DELIVERED } from '../../src/common/ipc';

const sendEnvelope = vi.hoisted(() => vi.fn<() => Promise<TransportMakeRequestResponse>>());

vi.mock('../../src/renderer/ipc', () => ({
  getIPC: () => ({
    sendEnvelope,
  }),
}));

const { makeRendererTransport } = await import('../../src/renderer/transport');

function transport() {
  return makeRendererTransport({
    url: 'http://localhost',
    recordDroppedEvent: () => undefined,
  });
}

async function send(
  body: TransportMakeRequestResponse | Error | undefined,
): Promise<TransportMakeRequestResponse | void> {
  sendEnvelope.mockImplementation(() => {
    if (body instanceof Error) {
      return Promise.reject(body);
    }
    if (body === undefined) {
      return Promise.resolve(undefined as unknown as TransportMakeRequestResponse);
    }
    return Promise.resolve(body);
  });

  return transport().send(createEventEnvelope({ message: 'report' }));
}

describe('envelopeDeliveryStatus', () => {
  test('passes through ingest status codes', () => {
    expect(envelopeDeliveryStatus({ statusCode: 200 })).toEqual({ statusCode: 200 });
    expect(envelopeDeliveryStatus({ statusCode: 413 })).toEqual({ statusCode: 413 });
    expect(envelopeDeliveryStatus({ statusCode: 429 })).toEqual({ statusCode: 429 });
  });

  test('does not treat a queued offline envelope as delivered', () => {
    // makeOfflineTransport resolves with {} when the send failed and the envelope was stored.
    expect(envelopeDeliveryStatus({})).toEqual(NOT_DELIVERED);
    expect(envelopeDeliveryStatus(undefined)).toEqual(NOT_DELIVERED);
  });

  test('drops rate-limit headers so the renderer does not also back off', () => {
    expect(
      envelopeDeliveryStatus({
        statusCode: 200,
        headers: { 'retry-after': '60', 'x-sentry-rate-limits': '60:error:organization' },
      }),
    ).toEqual({ statusCode: 200 });
  });
});

describe('decodeEnvelopeDeliveryStatus', () => {
  test('prefers the JSON status over a 2xx protocol response', () => {
    expect(decodeEnvelopeDeliveryStatus('{"statusCode":413}', 200)).toEqual({ statusCode: 413 });
    expect(decodeEnvelopeDeliveryStatus('{"statusCode":0}', 503)).toEqual({ statusCode: 0 });
  });

  test('does not invent a 200 for an empty protocol body', () => {
    expect(decodeEnvelopeDeliveryStatus('', 200)).toEqual(NOT_DELIVERED);
    expect(decodeEnvelopeDeliveryStatus('not-json', 200)).toEqual(NOT_DELIVERED);
  });

  test('uses a non-2xx HTTP status when the body has none', () => {
    expect(decodeEnvelopeDeliveryStatus('', 500)).toEqual({ statusCode: 500 });
  });
});

describe('makeRendererTransport', () => {
  beforeEach(() => {
    sendEnvelope.mockReset();
  });

  test('returns ingest 2xx only when the handoff reports it', async () => {
    await expect(send({ statusCode: 200 })).resolves.toEqual({ statusCode: 200 });
    expect(sendEnvelope).toHaveBeenCalledOnce();
  });

  test('does not return 200 when the protocol handoff fails', async () => {
    await expect(send(new Error('Failed to fetch'))).resolves.toEqual(NOT_DELIVERED);
  });

  test('does not return 200 when main only queued the envelope', async () => {
    await expect(send(undefined)).resolves.toEqual(NOT_DELIVERED);
    await expect(send({ statusCode: 0 })).resolves.toEqual(NOT_DELIVERED);
  });

  test('forwards ingest failures such as 413', async () => {
    await expect(send({ statusCode: 413 })).resolves.toEqual({ statusCode: 413 });
  });
});
