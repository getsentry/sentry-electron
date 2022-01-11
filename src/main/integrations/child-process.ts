import { addBreadcrumb, captureMessage, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Integration, SeverityLevel } from '@sentry/types';

import { EXIT_REASONS, ExitReason, onChildProcessGone, onRendererProcessGone } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

interface ChildProcessOptions {
  /** Child process events that generate breadcrumbs */
  breadcrumbs: Readonly<ExitReason[]>;
  /** Child process events that capture events */
  capture: Readonly<ExitReason[]>;
}

const DEFAULT_OPTIONS: ChildProcessOptions = {
  breadcrumbs: EXIT_REASONS,
  capture: ['abnormal-exit', 'launch-failed', 'integrity-failure'],
};

/** Gets message and severity */
function getMessageAndSeverity(reason: ExitReason, proc?: string): { message: string; level: SeverityLevel } {
  const message = `'${proc}'' process exited with '${reason}'`;

  switch (reason) {
    case 'abnormal-exit':
    case 'killed':
      return { message, level: 'warning' };
    case 'crashed':
    case 'oom':
    case 'launch-failed':
    case 'integrity-failure':
      return { message, level: 'critical' };
    default:
      return { message, level: 'debug' };
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
    const { breadcrumbs, capture } = options;
    this._options = {
      breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs : breadcrumbs == false ? [] : DEFAULT_OPTIONS.breadcrumbs,
      capture: Array.isArray(capture) ? capture : capture == false ? [] : DEFAULT_OPTIONS.capture,
    };
  }

  /** @inheritDoc */
  public setupOnce(): void {
    const { breadcrumbs, capture } = this._options;
    const allReasons = Array.from(new Set([...breadcrumbs, ...capture]));

    // only hook these events if we're after more than just the unresponsive event
    if (allReasons.length > 0) {
      const options = getCurrentHub().getClient<NodeClient>()?.getOptions() as ElectronMainOptions | undefined;

      onChildProcessGone(allReasons, (details) => {
        const { reason } = details;

        // Capture message first
        if (capture.includes(reason)) {
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
        if (capture.includes(reason)) {
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
