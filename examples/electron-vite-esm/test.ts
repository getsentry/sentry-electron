import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../test/e2e';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: (event) => {
        const payload = eventEnvelope({
          level: 'fatal',
          platform: 'node',
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'browser',
          },
          sdk: {
            settings: {
              infer_ip: 'never',
            },
          },
        });

        expect(event[0]).toEqual(payload[0]);

        const actualEvent = event[1][0][1] as Record<string, any>;
        expect(actualEvent.level).toBe('fatal');
        expect(actualEvent.platform).toBe('node');
        expect(actualEvent.tags['event.process']).toBe('browser');

        const firstException = actualEvent.exception.values[0];
        expect(firstException.type).toBe('ReferenceError');
        expect(firstException.value).toBe('require is not defined');

        const frames = firstException.stacktrace.frames as Array<Record<string, any>>;
        expect(
          frames.some(
            (frame) =>
              frame.function === 'ExportsCache.has' &&
              frame.context_line === '      const mod = require.cache[filename];',
          ),
        ).toBe(true);
        expect(
          frames.some(
            (frame) =>
              frame.function === 'Module.require' &&
              frame.filename === 'app:///out/main/index.js',
          ),
        ).toBe(true);
      },
    })
    .run();
});
