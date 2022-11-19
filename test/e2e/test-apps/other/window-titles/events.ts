import { Event } from '@sentry/types';
import { expect } from 'chai';

import { TestServerEvent } from '../../../server';

export async function execute(events: TestServerEvent<Event>[]): Promise<void> {
  expect(events).to.have.lengthOf(1);

  const event = events[0];

  expect(event.data.breadcrumbs?.length).to.be.greaterThan(5);

  for (const breadcrumb of event.data.breadcrumbs || []) {
    expect(breadcrumb?.data?.title).to.be.undefined;
  }
}
