import {
  captureEvent,
  enableAnrDetection as enableNodeAnrDetection,
  getCurrentHub,
  getModuleFromFilename,
  StackFrame,
} from '@sentry/node';
import { Event } from '@sentry/types';
import { createDebugPauseMessageHandler, logger, watchdogTimer } from '@sentry/utils';
import { app, WebContents } from 'electron';

import { RendererStatus } from '../common';
import { ELECTRON_MAJOR_VERSION } from './electron-normalize';
import { ElectronMainOptions } from './sdk';
import { sessionAnr } from './sessions';

function getRendererName(contents: WebContents): string | undefined {
  const options = getCurrentHub().getClient()?.getOptions() as ElectronMainOptions | undefined;
  return options?.getRendererName?.(contents);
}

function sendRendererAnrEvent(contents: WebContents, blockedMs: number, frames?: StackFrame[]): void {
  sessionAnr();

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

  const messageHandler = createDebugPauseMessageHandler(
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

function createHrTimer(): { getTimeMs: () => number; reset: () => void } {
  let lastPoll = process.hrtime();

  return {
    getTimeMs: (): number => {
      const [seconds, nanoSeconds] = process.hrtime(lastPoll);
      return Math.floor(seconds * 1e3 + nanoSeconds / 1e6);
    },
    reset: (): void => {
      lastPoll = process.hrtime();
    },
  };
}

/** Are we currently running in the ANR child process */
export function isAnrChildProcess(): boolean {
  return !!process.env.SENTRY_ANR_CHILD_PROCESS;
}

/** Creates a renderer ANR status hook */
export function createRendererAnrStatusHandler(): (status: RendererStatus, contents: WebContents) => void {
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

      watchdog = watchdogTimer(createHrTimer, 100, message.config.anrThreshold, async () => {
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

/**
 * **Note** This feature is still in beta so there may be breaking changes in future releases.
 *
 * Starts a child process that detects Application Not Responding (ANR) errors.
 *
 * It's important to await on the returned promise before your app code to ensure this code does not run in the ANR
 * child process.
 *
 * ```js
 * import { init, enableMainProcessAnrDetection } from '@sentry/electron';
 *
 * init({ dsn: "__DSN__" });
 *
 * // with ESM + Electron v28+
 * await enableMainProcessAnrDetection({ captureStackTrace: true });
 * runApp();
 *
 * // with CJS
 * enableMainProcessAnrDetection({ captureStackTrace: true }).then(() => {
 *   runApp();
 * });
 * ```
 */
export function enableMainProcessAnrDetection(options: Parameters<typeof enableNodeAnrDetection>[0]): Promise<void> {
  if (ELECTRON_MAJOR_VERSION < 4) {
    throw new Error('Main process ANR detection is only supported on Electron v4+');
  }

  const mainOptions = {
    entryScript: app.getAppPath(),
    ...options,
  };

  return enableNodeAnrDetection(mainOptions);
}
