import { Client, Event } from '@sentry/core';

interface Attributes {
  'os.name'?: string;
  'os.version'?: string;
  'device.brand'?: string;
  'device.model'?: string;
  'device.family'?: string;
}

/**
 * Fetch os and device attributes from the Context and AdditionalContext integrations
 */
async function getAttributes(client: Client): Promise<Attributes> {
  const contextIntegration = client.getIntegrationByName('Context');
  const additionalContextIntegration = client.getIntegrationByName('AdditionalContext');

  let event: Event = {};
  const hint = {};

  event = (await contextIntegration?.processEvent?.(event, hint, client)) || event;
  event = (await additionalContextIntegration?.processEvent?.(event, hint, client)) || event;

  const attrs: Attributes = {};
  if (event.contexts?.os?.name) {
    attrs['os.name'] = event.contexts.os.name;
  }
  if (event.contexts?.os?.version) {
    attrs['os.version'] = event.contexts.os.version;
  }
  if (event.contexts?.device?.brand) {
    attrs['device.brand'] = event.contexts.device.brand;
  }
  if (event.contexts?.device?.model) {
    attrs['device.model'] = event.contexts.device.model;
  }
  if (event.contexts?.device?.family) {
    attrs['device.family'] = event.contexts.device.family;
  }
  return attrs;
}

// Cached attributes
let attributes: Attributes | undefined;

/**
 * Get OS and device attributes for logs
 *
 * Some of this context is only available asynchronously, so we fetch it once
 * and cache it for future logs. Logs before the attributes are resolved will not
 * have this context.
 */
export function getOsDeviceLogAttributes(client: Client): Attributes {
  if (attributes === undefined) {
    // We set attributes to an empty object to indicate that we are already fetching them
    attributes = {};

    getAttributes(client)
      .then((attrs) => {
        attributes = attrs;
      })
      .catch(() => {
        // ignore
      });
  }

  return attributes || {};
}
