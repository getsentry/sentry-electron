import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/app/path',
  },
}));

import type { Envelope } from '@sentry/core';
import { createEnvelope } from '@sentry/core';
import { normalizeSpanStreamingEnvelope } from '../../src/main/normalize';
import type { ElectronMainOptionsInternal } from '../../src/main/sdk';

const options = { release: 'app@1.0.0', environment: 'staging' } as ElectronMainOptionsInternal;
const basePath = '/app/path';
const electronSdk = { name: 'sentry.javascript.electron', version: expect.any(String) };

describe('normalizeSpanStreamingEnvelope', () => {
  test('normalizes a v1 standalone span envelope', () => {
    const envelope = createEnvelope({ sent_at: '2026-01-01T00:00:00.000Z' }, [
      [
        { type: 'span' },
        {
          span_id: '1234567890abcdef',
          trace_id: '1234567890abcdef1234567890abcdef',
          start_timestamp: 1,
          timestamp: 2,
          description: 'file:///app/path/index.html',
          op: 'ui.interaction.click',
          origin: 'auto.http.browser.inp',
          data: {
            release: 'renderer-release',
            environment: 'production',
            transaction: 'file:///app/path/index.html',
          },
        },
      ],
    ]) as Envelope;

    const [normalized, segmentOrigin] = normalizeSpanStreamingEnvelope(options, envelope, basePath);

    expect(segmentOrigin).toBeUndefined();
    expect(normalized[0].sdk).toEqual(electronSdk);
    expect(normalized[1]).toHaveLength(1);
    expect(normalized[1][0]?.[1]).toMatchObject({
      description: 'app:///index.html',
      data: {
        release: 'app@1.0.0',
        environment: 'staging',
        transaction: 'app:///index.html',
      },
    });
  });

  test('normalizes a v2 span container envelope', () => {
    const envelope = createEnvelope({ sent_at: '2026-01-01T00:00:00.000Z' }, [
      [
        { type: 'span', item_count: 1, content_type: 'application/vnd.sentry.items.span.v2+json' },
        {
          items: [
            {
              span_id: '1234567890abcdef',
              trace_id: '1234567890abcdef1234567890abcdef',
              name: 'file:///app/path/index.html',
              start_timestamp: 1,
              end_timestamp: 2,
              status: 'ok',
              is_segment: true,
              attributes: {
                'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
              },
            },
          ],
        },
      ],
    ]) as Envelope;

    const [normalized, segmentOrigin] = normalizeSpanStreamingEnvelope(options, envelope, basePath);

    expect(segmentOrigin).toEqual('auto.pageload.browser');
    expect(normalized[0].sdk).toEqual(electronSdk);
    expect(normalized[1][0]?.[1]).toMatchObject({
      items: [{ name: 'app:///index.html' }],
    });
  });
});
