import {
  captureEvent,
  enableAnrDetection as enableNodeAnrDetection,
  getCurrentHub,
  getModuleFromFilename,
  StackFrame,
} from '@sentry/node';
import { Event } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app, WebContents } from 'electron';

import { RendererStatus } from '../common';
import { createDebuggerMessageHandler, watchdogTimer } from './anr-utils';
import { ELECTRON_MAJOR_VERSION } from './electron-normalize';
import { ElectronMainOptions } from './sdk';

function getRendererName(contents: WebContents): string | undefined {
  const options = getCurrentHub().getClient()?.getOptions() as ElectronMainOptions | undefined;
  return options?.getRendererName?.(contents);
}

function sendRendererAnrEvent(contents: WebContents, blockedMs: number, frames?: StackFrame[]): void {
  const rendererName = getRendererName(contents) || 'renderer';

  const event: Event = {
    level: 'error',
    exception: {
      values: [
        {
          type: 'ApplicationNotResponding',
          value: `Application Not Responding for at least ${blockedMs} ms`,
          stacktrace: { frames },
          mechanism: {
            // This ensures the UI doesn't say 'Crashed in' for the stack trace
            type: 'ANR',
          },
        },
      ],
    },
    tags: {
      'event.process': rendererName,
    },
  };

  captureEvent(event);
}

function rendererDebugger(contents: WebContents, pausedStack: (frames: StackFrame[]) => void): () => void {
  contents.debugger.attach('1.3');

  const messageHandler = createDebuggerMessageHandler(
    (cmd) => contents.debugger.sendCommand(cmd),
    getModuleFromFilename,
    pausedStack,
  );

  contents.debugger.on('message', (_, method, params) => {
    messageHandler({ method, params } as Parameters<typeof messageHandler>[0]);
  });

  // In node, we enable just before pausing but for Chrome, the debugger must be enabled before he ANR event occurs
  void contents.debugger.sendCommand('Debugger.enable');

  return () => {
    return contents.debugger.sendCommand('Debugger.pause');
  };
}

let rendererWatchdogTimers: Map<WebContents, ReturnType<typeof watchdogTimer>> | undefined;

/** Creates a renderer ANR status hook */
export function createRendererAnrStatusHook(): (status: RendererStatus, contents: WebContents) => void {
  function log(message: string, ...args: unknown[]): void {
    logger.log(`[Renderer ANR] ${message}`, ...args);
  }

  return (message: RendererStatus, contents: WebContents): void => {
    rendererWatchdogTimers = rendererWatchdogTimers || new Map();

    let watchdog = rendererWatchdogTimers.get(contents);

    if (watchdog === undefined) {
      log('Renderer sent first status message', message.config);
      let pauseAndCapture: (() => void) | undefined;

      if (message.config.captureStackTrace) {
        log('Connecting to debugger');
        pauseAndCapture = rendererDebugger(contents, (frames) => {
          log('Event captured with stack frames');
          sendRendererAnrEvent(contents, message.config.anrThreshold, frames);
        });
      }

      watchdog = watchdogTimer(100, message.config.anrThreshold, async () => {
        log('Watchdog timeout');
        if (pauseAndCapture) {
          log('Pausing debugger to capture stack trace');
          pauseAndCapture();
        } else {
          log('Capturing event');
          sendRendererAnrEvent(contents, message.config.anrThreshold);
        }
      });

      contents.once('destroyed', () => {
        rendererWatchdogTimers?.delete(contents);
      });

      rendererWatchdogTimers.set(contents, watchdog);
    }

    watchdog.poll();

    if (message.status !== 'alive') {
      log('Renderer visibility changed', message.status);
      watchdog.enabled(message.status === 'visible');
    }
  };
}

type MainProcessAnrOptions = Parameters<typeof enableNodeAnrDetection>[0];

function enableAnrMainProcess(options: MainProcessAnrOptions): Promise<void> {
  if (ELECTRON_MAJOR_VERSION < 4) {
    throw new Error('Main process ANR detection is only supported on Electron v4+');
  }

  const mainOptions = {
    entryScript: app.getAppPath(),
    ...options,
  };

  return enableNodeAnrDetection(mainOptions);
}

interface Options {
  /**
   * Main process ANR options.
   *
   * Set to false to disable ANR detection in the main process.
   */
  mainProcess?: MainProcessAnrOptions | false;
}

/**
 * **Note** This feature is still in beta so there may be breaking changes in future releases.
 *
 * Starts a child process that detects Application Not Responding (ANR) errors.
 *
 * It's important to await on the returned promise before your app code to ensure this code does not run in the ANR
 * child process.
 *
 * ```js
 * import { init, enableAnrDetection } from '@sentry/electron';
 *
 * init({ dsn: "__DSN__" });
 *
 * // with ESM + Electron v28+
 * await enableAnrDetection({ mainProcess: { captureStackTrace: true }});
 * runApp();
 *
 * // with CJS
 * enableAnrDetection({ mainProcess: { captureStackTrace: true }}).then(() => {
 *   runApp();
 * });
 * ```
 */
export async function enableAnrDetection(options: Options = {}): Promise<void> {
  if (options.mainProcess !== false) {
    return enableAnrMainProcess(options.mainProcess || {});
  }

  return Promise.resolve();
}
