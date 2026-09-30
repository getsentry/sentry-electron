import { expect } from 'vitest';
import { electronTestRunner, getSpansFromEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      // The renderer sends its pageload as a transaction and the main process re-creates its spans
      // in the streamed `Startup` segment
      envelope: (envelope) => {
        const spans = getSpansFromEnvelope(envelope);
        expect(spans).toBeDefined();

        const segment = spans?.find((s) => s.is_segment);
        expect(segment?.name).toEqual('Startup');

        const processFor = (op: string): unknown =>
          (
            spans?.find((s) => s.attributes?.['sentry.op']?.value === op)?.attributes as
              | Record<string, { value?: unknown }>
              | undefined
          )?.['electron.process']?.value;

        // Spans keep the name of the process they were created in
        expect(segment?.attributes?.['electron.process']).toEqual({ value: 'browser', type: 'string' });
        expect(processFor('electron.ready')).toEqual('browser');
        expect(processFor('electron.renderer')).toEqual('renderer');
        expect(processFor('browser.request')).toEqual('renderer');
      },
    })
    .run();
});
