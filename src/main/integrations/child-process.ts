import { addBreadcrumb, captureMessage, defineIntegration, SeverityLevel } from '@sentry/core';
import { childProcessIntegration as nodeChildProcessIntegration, NodeClient } from '@sentry/node';
import { app } from 'electron';
import { EXIT_REASONS, ExitReason } from '../electron-normalize.js';
import { ElectronMainOptions } from '../sdk.js';

type NodeChildProcessOptions = NonNullable<Parameters<typeof nodeChildProcessIntegration>[0]>;

type OrBool<T> = {
  [P in keyof T]: T[P] | boolean;
};

export interface ChildProcessOptions extends NodeChildProcessOptions {
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

/**
 * Adds breadcrumbs for:
 * - Electron child process events
 * - Node `child_process` events
 * - Node `worker_threads` events
 */
export const childProcessIntegration = defineIntegration((userOptions: Partial<OrBool<ChildProcessOptions>> = {}) => {
  const { breadcrumbs, events } = userOptions;

  const nodeIntegration = nodeChildProcessIntegration(userOptions);

  const options: ChildProcessOptions = {
    breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs : breadcrumbs === false ? [] : DEFAULT_OPTIONS.breadcrumbs,
    events: Array.isArray(events) ? events : events === false ? [] : DEFAULT_OPTIONS.events,
  };

  return {
    name: 'ChildProcess',
    setup(client: NodeClient) {
      nodeIntegration.setup?.(client);

      const { breadcrumbs, events } = options;
      const allReasons = Array.from(new Set([...breadcrumbs, ...events]));

      // only hook these events if we're after more than just the unresponsive event
      if (allReasons.length > 0) {
        const clientOptions = client.getOptions() as ElectronMainOptions;

        app.on('child-process-gone', (_, details) => {
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

        app.on('render-process-gone', (_, contents, details) => {
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
});
