import { defaultIntegrations } from '@sentry/browser';
import { initAndBind } from '@sentry/core';
import { ElectronOptions } from '..';
import { RendererClient } from './client';
export { RendererBackend } from './backend';
export { RendererClient } from './client';
export { Integrations as BrowserIntegrations } from '@sentry/browser';

/**
 * Call init on @sentry/browser with all browser integrations
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }
  initAndBind(RendererClient, options);
}
