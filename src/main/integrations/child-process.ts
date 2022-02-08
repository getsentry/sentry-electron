import { addBreadcrumb, captureMessage, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Integration, Severity } from '@sentry/types';

import { OrBool } from '../../common/types';
import { EXIT_REASONS, ExitReason, onChildProcessGone, onRendererProcessGone } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

interface ChildProcessOptions {
  /** Child process events that generate breadcrumbs */
  breadcrumbs: Readonly<ExitReason[]>;
  /** Child process events that generate Sentry events */
  events: Readonly<ExitReason[]>;
}

const DEFAULT_OPTIONS: ChildProcessOptions = {
  breadcrumbs: EXIT_REASONS,
  events: ['abnormal-exit', 'launch-failed', 'integrity-failure'],
};

/** Gets message and severity */
function getMessageAndSeverity(reason: ExitReason, proc?: string): { message: string; level: Severity } {
  const message = `'${proc}'' process exited with '${reason}'`;

  switch (reason) {
    case 'abnormal-exit':
    case 'killed':
      return { message, level: Severity.Warning };
    case 'crashed':
    case 'oom':
    case 'launch-failed':
    case 'integrity-failure':
      return { message, level: Severity.Critical };
    default:
      return { message, level: Severity.Debug };
  }
}

/** Adds breadcrumbs for Electron events. */
export class ChildProcess implements Integration {
  /** @inheritDoc */
  public static id: string = 'ChildProcess';

  /** @inheritDoc */
  public name: string = ChildProcess.id;

  private readonly _options: ChildProcessOptions;

  /**
   * @param _options Integration options
   */
  public constructor(options: Partial<OrBool<ChildProcessOptions>> = {}) {
    const { breadcrumbs, events } = options;
    this._options = {
      breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs : breadcrumbs == false ? [] : DEFAULT_OPTIONS.breadcrumbs,
      events: Array.isArray(events) ? events : events == false ? [] : DEFAULT_OPTIONS.events,
    };
  }

  /** @inheritDoc */
  public setupOnce(): void {
    const { breadcrumbs, events } = this._options;
    const allReasons = Array.from(new Set([...breadcrumbs, ...events]));

    // only hook these events if we're after more than just the unresponsive event
    if (allReasons.length > 0) {
      const options = getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions | undefined;

      onChildProcessGone(allReasons, (details) => {
        const { reason } = details;

        // Capture message first
        if (events.includes(reason)) {
          const { message, level } = getMessageAndSeverity(details.reason, details.type);
          captureMessage(message, { level, tags: { 'event.process': details.type } });
        }

        // And then add breadcrumbs for subsequent events
        if (breadcrumbs.includes(reason)) {
          addBreadcrumb({
            type: 'process',
            category: 'child-process',
            ...getMessageAndSeverity(details.reason, details.type),
            data: details,
          });
        }
      });

      onRendererProcessGone(allReasons, (contents, details) => {
        const { reason } = details;
        const name = options?.getRendererName?.(contents) || 'renderer';

        // Capture message first
        if (events.includes(reason)) {
          const { message, level } = getMessageAndSeverity(details.reason, name);
          captureMessage(message, level);
        }

        // And then add breadcrumbs for subsequent events
        if (breadcrumbs.includes(reason)) {
          addBreadcrumb({
            type: 'process',
            category: 'child-process',
            ...getMessageAndSeverity(details.reason, name),
            data: details,
          });
        }
      });
    }
  }
}
