import { Event } from '@sentry/types';
import { expect } from 'chai';

import { TestServerEvent } from '../../../server';

export async function execute(events: TestServerEvent<Event>[]): Promise<void> {
  expect(events).to.have.lengthOf(1);

  const event = events[0];

  expect(event.data.breadcrumbs?.length).to.be.greaterThan(5);

  let withData = 0;

  for (const breadcrumb of event.data.breadcrumbs || []) {
    if (breadcrumb?.data?.id) {
      withData += 1;
    }

    expect(breadcrumb?.data?.title).to.be.undefined;
  }

  expect(withData).to.be.greaterThanOrEqual(2);
}
