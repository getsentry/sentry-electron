import type { Client } from '@sentry/core';
import { filterCollectedUrl, stripUrlQueryAndFragment } from '@sentry/core';

/**
 * Applies `dataCollection.urlQueryParams` to a URL the SDK collected.
 * A fragment has no keys to filter, so it is only removed when
 * query param collection is off.
 */
export function filterUrl(url: string, client: Client): string {
  if (client.getDataCollectionOptions().urlQueryParams === false) {
    return stripUrlQueryAndFragment(url);
  }

  return filterCollectedUrl(url, client);
}
