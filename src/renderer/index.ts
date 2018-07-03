import { Integrations } from '@sentry/browser';
import { initAndBind } from '@sentry/core';
import { ElectronOptions } from '..';
import { RendererClient } from './client';
export { RendererBackend } from './backend';
export { RendererClient } from './client';

/**
 * TODO
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  initAndBind(RendererClient, options, [
    new Integrations.Breadcrumbs(),
    new Integrations.FunctionToString(),
    new Integrations.OnError(),
    new Integrations.OnUnhandledRejection(),
    new Integrations.TryCatch(),
  ]);
}
