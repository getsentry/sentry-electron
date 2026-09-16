import type { Envelope } from '@sentry/core';
import { expect } from 'vitest';
import { electronTestRunner, feedbackEnvelope } from '../../..';

const ATTACHMENT_SIZE = 64 * 1024;

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: (envelope) => {
        const items = envelope[1];
        const attachment = items.find((item) => item[0].type === 'attachment');
        expect(attachment?.[0]).toMatchObject({
          filename: 'report.txt',
          content_type: 'text/plain',
          length: ATTACHMENT_SIZE,
        });
        expect(attachment?.[1]).toBeInstanceOf(Uint8Array);
        expect((attachment?.[1] as Uint8Array).byteLength).toBe(ATTACHMENT_SIZE);

        const withoutAttachment = [envelope[0], items.filter((item) => item !== attachment)] as Envelope;
        expect(withoutAttachment).toEqual(
          feedbackEnvelope({
            type: 'feedback',
            level: 'info',
            platform: 'javascript',
            request: {
              headers: {},
              url: 'app:///src/index.html',
            },
            tags: {
              'event.environment': 'javascript',
              'event.origin': 'electron',
              'event.process': 'renderer',
            },
          }),
        );
      },
    })
    .run();
});
