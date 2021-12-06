import { addBreadcrumb, captureMessage, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Integration, Severity } from '@sentry/types';

import { ALL_REASONS, ExitReason, onChildProcessGone, onRendererProcessGone } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

interface ChildProcessOptions<T> {
  /** Child process events that generate breadcrumbs */
  breadcrumbs: T;
  /** Child process events that capture events */
  capture: T;
}

const DEFAULT_OPTIONS: ChildProcessOptions<ExitReason[]> = {
  breadcrumbs: ALL_REASONS,
  capture: ['abnormal-exit', 'launch-failed', 'integrity-failure'],
};

/** Gets message and severity */
function getMessageAndSeverity(reason: ExitReason, proc?: string): { message: string; level: Severity } {
  const message = `'${proc}'' process exited with '${reason}'`;

  let level = Severity.Debug;

  switch (reason) {
    case 'abnormal-exit':
    case 'killed':
      level = Severity.Warning;
      break;
    case 'crashed':
    case 'oom':
    case 'launch-failed':
    case 'integrity-failure':
      level = Severity.Critical;
  }

  return { message, level };
}

/** Adds breadcrumbs for Electron events. */
export class ChildProcess implements Integration {
  /** @inheritDoc */
  public static id: string = 'ChildProcess';

  /** @inheritDoc */
  public name: string = ChildProcess.id;

  private readonly _options: ChildProcessOptions<ExitReason[]>;

  /**
   * @param _options Integration options
   */
  public constructor(options: Partial<ChildProcessOptions<ExitReason[] | boolean>> = {}) {
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
        const getName = (): string => options?.getRendererName?.(contents) || 'renderer';

        // Capture message first
        if (capture.includes(reason)) {
          const { message, level } = getMessageAndSeverity(details.reason, getName());
          captureMessage(message, level);
        }

        // And then add breadcrumbs for subsequent events
        if (breadcrumbs.includes(reason)) {
          addBreadcrumb({
            type: 'process',
            category: 'child-process',
            ...getMessageAndSeverity(details.reason, getName()),
            data: details,
          });
        }
      });
    }
  }
}
