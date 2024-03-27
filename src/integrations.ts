/* eslint-disable deprecation/deprecation */
import { Integration } from '@sentry/types';
import { dynamicRequire } from '@sentry/utils';

import { ElectronOptions } from './';
import {
  AdditionalContext,
  ChildProcess,
  ElectronBreadcrumbs,
  ElectronMinidump,
  MainContext,
  MainProcessSession,
  OnUncaughtException,
  PreloadInjection,
  Screenshots,
  SentryMinidump,
} from './main/integrations';
import { ScopeToMain } from './renderer/integrations/scope-to-main';

/** Convenience interface used to expose Integrations */
export interface Integrations {
  // For main process
  SentryMinidump: typeof SentryMinidump;
  ElectronMinidump: typeof ElectronMinidump;
  ElectronBreadcrumbs: typeof ElectronBreadcrumbs;
  MainContext: typeof MainContext;
  OnUncaughtExcept: typeof OnUncaughtException;
  PreloadInjection: typeof PreloadInjection;
  MainProcessSession: typeof MainProcessSession;
  AdditionalContext: typeof AdditionalContext;
  ChildProcess: typeof ChildProcess;
  Screenshots: typeof Screenshots;
  // For renderer process
  ScopeToMain: typeof ScopeToMain;
}

/** Return all Electron integrations and add EmptyIntegrations for integrations missing in this process. */
export function getIntegrations(): Integrations {
  return process.type === 'browser'
    ? {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        ...dynamicRequire(module, './main').Integrations,
        ScopeToMain: EmptyIntegration,
        EventToMain: EmptyIntegration,
      }
    : {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        ...dynamicRequire(module, './renderer').Integrations,
        SentryMinidump: EmptyIntegration,
        ElectronMinidump: EmptyIntegration,
        ElectronBreadcrumbs: EmptyIntegration,
        MainContext: EmptyIntegration,
        OnUncaughtExcept: EmptyIntegration,
        PreloadInjection: EmptyIntegration,
        MainProcessSession: EmptyIntegration,
        AdditionalContext: EmptyIntegration,
        ChildProcess: EmptyIntegration,
        Screenshots: EmptyIntegration,
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
  public static id = 'EmptyIntegration';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = EmptyIntegration.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    //
  }
}

/** Filters out any EmptyIntegrations that are found */
export function removeEmptyIntegrations(options: Partial<ElectronOptions>): void {
  if (Array.isArray(options.integrations)) {
    options.integrations = options.integrations.filter((i) => i.name !== EmptyIntegration.id);
  } else if (typeof options.integrations === 'function') {
    const originalFn = options.integrations;

    options.integrations = (integrations) => {
      const userIntegrations = originalFn(integrations);
      return userIntegrations.filter((integration) => integration.name !== EmptyIntegration.id);
    };
  }
}
