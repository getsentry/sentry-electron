import { Integration, IntegrationClass } from '@sentry/types';
import { dynamicRequire } from '@sentry/utils';
import { ElectronOptions } from './';

import {
  MainContext,
  ElectronEvents,
  ElectronMinidump,
  OnUncaughtException,
  PreloadInjection,
  RendererIPC,
  SentryMinidump,
} from './main/integrations';
import { EventToMain, RendererContext, ScopeToMain } from './renderer/integrations';

/** Convenience interface used to expose Integrations */
export interface Integrations {
  // For main process
  SentryMinidump: IntegrationClass<SentryMinidump>;
  ElectronMinidump: IntegrationClass<ElectronMinidump>;
  ElectronEvents: IntegrationClass<ElectronEvents>;
  MainContext: IntegrationClass<MainContext>;
  RendererIPC: IntegrationClass<RendererIPC>;
  OnUncaughtExcept: IntegrationClass<OnUncaughtException>;
  PreloadInjection: IntegrationClass<PreloadInjection>;
  // For renderer process
  ScopeToMain: IntegrationClass<ScopeToMain>;
  EventToMain: IntegrationClass<EventToMain>;
  RendererContext: IntegrationClass<RendererContext>;
}

/** Return all Electron integrations and add EmptyIntegrations for integrations missing in this process. */
export function getIntegrations(): Integrations {
  return process.type === 'browser'
    ? {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        ...dynamicRequire(module, './main').Integrations,
        ScopeToMain: EmptyIntegration,
        EventToMain: EmptyIntegration,
        RendererContext: EmptyIntegration,
      }
    : {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        ...dynamicRequire(module, './renderer').Integrations,
        SentryMinidump: EmptyIntegration,
        ElectronMinidump: EmptyIntegration,
        ElectronEvents: EmptyIntegration,
        MainContext: EmptyIntegration,
        RendererIPC: EmptyIntegration,
        OnUncaughtExcept: EmptyIntegration,
        PreloadInjection: EmptyIntegration,
      };
}

/**
 * The EmptyIntegration gets loaded when the requested integration cannot be used in the current Electron process
 *
 * This allows you to call the same code from both Electron processes and not have to conditionally compile
 *
 * ```
 * const { init, Integrations } = require('@sentry/electron');
 *
 * init({
 *   dsn: process.env.DSN,
 *   integrations: [new Integrations.ElectronMinidump()],
 * });
 *
 */
class EmptyIntegration implements Integration {
  /** @inheritDoc */
  public static id: string = 'EmptyIntegration';

  /** @inheritDoc */
  public name: string = EmptyIntegration.id;

  /** @inheritDoc */
  public setupOnce(): void {
    //
  }
}

/** Filters out any EmptyIntegrations that are found */
export function removeEmptyIntegrations(options: ElectronOptions): void {
  if (Array.isArray(options.integrations)) {
    options.integrations = options.integrations.filter((i) => i.name !== 'EmptyIntegration');
  } else if (typeof options.integrations === 'function') {
    const originalFn = options.integrations;

    options.integrations = (integrations) => {
      const userIntegrations = originalFn(integrations);
      return userIntegrations.filter((integration) => integration.name !== 'EmptyIntegration');
    };
  }
}
