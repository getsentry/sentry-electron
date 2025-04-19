import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        message: 'This is an error message',
        extra: {
          arguments: ['This is an error message'],
        },
        logger: 'console',
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
        request: {
          headers: {},
          url: 'app:///src/index.html',
        },
      }),
    })
    .run();
});
