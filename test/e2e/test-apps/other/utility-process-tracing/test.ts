import type { Envelope } from '@sentry/core';
import { expect } from 'vitest';
import { electronTestRunner, SDK_VERSION } from '../../..';

type Item = { name?: string; body?: string; is_segment?: boolean; attributes?: Record<string, unknown> };

function itemsOfType(envelope: Envelope, type: string): Item[] | undefined {
  const item = envelope[1].find(([headers]) => (headers.type as string) === type);
  return (item?.[1] as { items?: Item[] } | undefined)?.items;
}

// Spans, logs and metrics from utility processes get the main process release, environment and SDK
const MAIN_PROCESS_ATTRIBUTES = {
  'sentry.release': { value: 'some-release', type: 'string' },
  'sentry.environment': { value: 'development', type: 'string' },
  'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
  'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
  'electron.process': { value: 'utility', type: 'string' },
};

const OS_ATTRIBUTES = {
  'os.name': { value: expect.any(String), type: 'string' },
};

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .ignoreExpectationOrder()
    .expect({
      envelope: (envelope) => {
        const spans = itemsOfType(envelope, 'span');
        expect(spans).toHaveLength(2);

        const [header] = envelope;
        expect(header.sdk).toEqual({ name: 'sentry.javascript.electron', version: SDK_VERSION });
        expect(header.trace).toMatchObject({ release: 'some-release', environment: 'development' });

        const segment = spans?.find((span) => span.is_segment);
        expect(segment?.name).toEqual('utility-span');
        expect(segment?.attributes).toMatchObject({ ...MAIN_PROCESS_ATTRIBUTES, ...OS_ATTRIBUTES });

        const child = spans?.find((span) => !span.is_segment);
        expect(child?.name).toEqual('utility-child-span');
        expect(child?.attributes).toMatchObject(MAIN_PROCESS_ATTRIBUTES);
      },
    })
    .expect({
      envelope: (envelope) => {
        const logs = itemsOfType(envelope, 'log');
        expect(logs).toHaveLength(1);
        expect(logs?.[0]?.body).toEqual('utility log');
        expect(logs?.[0]?.attributes).toMatchObject({ ...MAIN_PROCESS_ATTRIBUTES, ...OS_ATTRIBUTES });
      },
    })
    .expect({
      envelope: (envelope) => {
        const metrics = itemsOfType(envelope, 'trace_metric');
        expect(metrics).toHaveLength(1);
        expect(metrics?.[0]?.name).toEqual('utility.metric');
        expect(metrics?.[0]?.attributes).toMatchObject({ ...MAIN_PROCESS_ATTRIBUTES, ...OS_ATTRIBUTES });
      },
    })
    .run();
});
