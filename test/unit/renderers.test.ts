import type { Client, CollectBehavior } from '@sentry/core';
import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/app/path',
  },
}));

import { filterNavigationUrl } from '../../src/main/renderers';

function clientWith(urlQueryParams: CollectBehavior): Client {
  return { getDataCollectionOptions: () => ({ urlQueryParams }) } as unknown as Client;
}

const url = 'app:///index.html?page=2&token=abc#/settings';

describe('filterNavigationUrl', () => {
  test('keeps the query and fragment by default', () => {
    expect(filterNavigationUrl(url, clientWith(true))).toBe('app:///index.html?page=2&token=[Filtered]#/settings');
  });

  test('removes the query and fragment when disabled', () => {
    expect(filterNavigationUrl(url, clientWith(false))).toBe('app:///index.html');
  });

  test('filters query params with an allow list', () => {
    expect(filterNavigationUrl(url, clientWith({ allow: ['page'] }))).toBe(
      'app:///index.html?page=2&token=[Filtered]#/settings',
    );
  });

  test('filters query params with a deny list', () => {
    expect(filterNavigationUrl(url, clientWith({ deny: ['page'] }))).toBe(
      'app:///index.html?page=[Filtered]&token=[Filtered]#/settings',
    );
  });

  test('leaves a URL without query or fragment as is', () => {
    expect(filterNavigationUrl('app:///index.html', clientWith(false))).toBe('app:///index.html');
  });
});
