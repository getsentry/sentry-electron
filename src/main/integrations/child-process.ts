import {
  addBreadcrumb,
  captureMessage,
  defineIntegration,
  Log,
  ParameterizedString,
  SeverityLevel,
} from '@sentry/core';
import { childProcessIntegration as nodeChildProcessIntegration, logger, NodeClient } from '@sentry/node';
import { app } from 'electron';
import { EXIT_REASONS, ExitReason } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';

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

type LogFn = (msg: ParameterizedString, attributes: Log['attributes']) => void;

/** Gets message and severity */
function getMessageAndSeverity(
  reason: ExitReason,
  process: string,
): { message: string, level: SeverityLevel; log: LogFn } {
  const message = `'${process}' process exited with '${reason}'`;

  switch (reason) {
    case 'abnormal-exit':
    case 'killed':
      return { message, level: 'warning', log: logger.warn };
    case 'crashed':
    case 'oom':
    case 'launch-failed':
    case 'integrity-failure':
      return { message, level: 'fatal', log: logger.error };
    default:
      return { message, level: 'debug', log: logger.info };
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

          const { message, level, log } = getMessageAndSeverity(details.reason, details.type);

          // Capture message first
          if (events.includes(reason)) {
            captureMessage(message, { level, tags: { 'event.process': details.type } });
          }

          // And then add breadcrumbs for subsequent events
          if (breadcrumbs.includes(reason)) {
            addBreadcrumb({
              type: 'process',
              category: 'child-process',
              message,
              level,
              data: details,
            });

            log(logger.fmt`'${process}' process exited with '${reason}'`, {
              exitCode: details.exitCode,
              name: details.name,
              serviceName: details.serviceName,
            });
          }
        });

        app.on('render-process-gone', (_, contents, details) => {
          const { reason } = details;
          const processName = clientOptions?.getRendererName?.(contents) || 'renderer';
          const { message, level, log } = getMessageAndSeverity(details.reason, processName);

          // Capture message first
          if (events.includes(reason)) {
            captureMessage(message, level);
          }

          // And then add breadcrumbs for subsequent events
          if (breadcrumbs.includes(reason)) {
            addBreadcrumb({
              type: 'process',
              category: 'child-process',
              ...getMessageAndSeverity(details.reason, processName),
              data: details,
            });

            log(logger.fmt`'${processName}' process exited with '${reason}'`, {
              exitCode: details.exitCode,
            });
          }
        });
      }
    },
  };
});
