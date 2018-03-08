import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import { TestContext } from './test-context';
import { TestServer } from './test-server';

should();
use(chaiAsPromised);

describe('Basic Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext(path.join(__dirname, 'fixtures/path with spaces/'));
    await context.start();
  });

  afterEach(async () => {
    await context.stop();
  });

  it('JavaScript exception in main process', async () => {
    await context.clickCrashButton('#error-main');
    await context.waitForTrue(() => context.testServer.events.length >= 1);
    const event = context.testServer.events[0];

    expect(context.testServer.events.length).to.equal(1);
    // tslint:disable-next-line:no-console
    console.log(context.testServer.events[0].data.exception[0].stacktrace.frames[3]);
    expect(context.testServer.events[0].data.exception[0].stacktrace.frames[3].filename).to.equal('main.js');
    expect(context.testServer.events[0].data.exception[0].stacktrace.frames[3].function).to.equal('Timeout.setTimeout');
  });
});
