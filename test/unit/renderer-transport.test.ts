import type { TransportMakeRequestResponse } from '@sentry/core';
import { createEnvelope, createEventEnvelope } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const sendEnvelope = vi.hoisted(() => vi.fn());
const sendFeedback = vi.hoisted(() => vi.fn<() => Promise<TransportMakeRequestResponse>>());

vi.mock('../../src/renderer/ipc', () => ({
  getIPC: () => ({ sendEnvelope, sendFeedback }),
}));

const { makeRendererTransport } = await import('../../src/renderer/transport');

function transport() {
  return makeRendererTransport({ url: 'http://localhost', recordDroppedEvent: () => undefined });
}

describe('makeRendererTransport', () => {
  beforeEach(() => {
    sendEnvelope.mockReset();
    sendFeedback.mockReset();
  });

  test('sends other envelopes without waiting and returns 200', async () => {
    const result = await transport().send(createEventEnvelope({ message: 'error' }));

    expect(result).toEqual({ statusCode: 200 });
    expect(sendEnvelope).toHaveBeenCalledOnce();
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  test('sends feedback via the feedback channel and returns the result', async () => {
    sendFeedback.mockResolvedValue({ statusCode: 413 });

    const result = await transport().send(createEventEnvelope({ type: 'feedback' }));

    expect(result).toEqual({ statusCode: 413 });
    expect(sendFeedback).toHaveBeenCalledOnce();
    expect(sendEnvelope).not.toHaveBeenCalled();
  });

  test('picks the channel per envelope', async () => {
    sendFeedback.mockResolvedValue({});
    const t = transport();

    await t.send(createEventEnvelope({ type: 'feedback' }));
    await t.send(createEnvelope({}, [[{ type: 'session' }, { sid: 'abc' }]]));

    expect(sendFeedback).toHaveBeenCalledOnce();
    expect(sendEnvelope).toHaveBeenCalledOnce();
  });
});
