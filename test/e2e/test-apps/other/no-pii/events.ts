import { Event } from '@sentry/core';
import { expect } from 'vitest';

import { TestServerEvent } from '../../../server';

export async function execute(events: TestServerEvent<Event>[]): Promise<void> {
  expect(events.length).greaterThanOrEqual(1);

  for (const event of events) {
    expect(event.data.user?.ip_address).toBeUndefined();
  }
}
