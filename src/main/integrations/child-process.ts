import { addBreadcrumb, captureMessage, convertIntegrationFnToClass } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { IntegrationFn, SeverityLevel } from '@sentry/types';

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
function getMessageAndSeverity(reason: ExitReason, proc?: string): { message: string; level: SeverityLevel } {
  const message = `'${proc}' process exited with '${reason}'`;

  switch (reason) {
    case 'abnormal-exit':
    case 'killed':
      return { message, level: 'warning' };
    case 'crashed':
    case 'oom':
    case 'launch-failed':
    case 'integrity-failure':
      return { message, level: 'fatal' };
    default:
      return { message, level: 'debug' };
  }
}

const INTEGRATION_NAME = 'ChildProcess';

const childProcess: IntegrationFn = (userOptions: Partial<OrBool<ChildProcessOptions>> = {}) => {
  const { breadcrumbs, events } = userOptions;

  const options: ChildProcessOptions = {
    breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs : breadcrumbs === false ? [] : DEFAULT_OPTIONS.breadcrumbs,
    events: Array.isArray(events) ? events : events === false ? [] : DEFAULT_OPTIONS.events,
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // noop
    },
    setup(client: NodeClient) {
      const { breadcrumbs, events } = options;
      const allReasons = Array.from(new Set([...breadcrumbs, ...events]));

      // only hook these events if we're after more than just the unresponsive event
      if (allReasons.length > 0) {
        const clientOptions = client.getOptions() as ElectronMainOptions;

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
          const name = clientOptions?.getRendererName?.(contents) || 'renderer';

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
    },
  };
};

/** Adds breadcrumbs for Electron events. */
// eslint-disable-next-line deprecation/deprecation
export const ChildProcess = convertIntegrationFnToClass(INTEGRATION_NAME, childProcess);
