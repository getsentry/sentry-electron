import { electronTestRunner, feedbackEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: feedbackEnvelope({
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
    })
    .run();
});
