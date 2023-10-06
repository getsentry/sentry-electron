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
import { addStatusListener } from './ipc';
import { ElectronMainOptions } from './sdk';

let cachedOptions: ElectronMainOptions | undefined;

function getOptions(): ElectronMainOptions | undefined {
  if (cachedOptions === undefined) {
    cachedOptions = getCurrentHub().getClient()?.getOptions() as ElectronMainOptions | undefined;
  }

  return cachedOptions;
}

function sendRendererAnrEvent(contents: WebContents, blockedMs: number, frames?: StackFrame[]): void {
  const rendererName = getOptions()?.getRendererName?.(contents) || 'renderer';

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

interface RendererProcessAnrOptions {
  /**
   * The number of milliseconds to wait before considering the renderer process to be unresponsive.
   */
  anrThreshold: number;
  /**
   * Whether to capture a stack trace when the renderer process is unresponsive.
   */
  captureStackTrace: boolean;
  /**
   * Whether to log debug messages to the console.
   */
  debug: boolean;
}

function enableAnrRendererProcesses(options: RendererProcessAnrOptions): void {
  function log(message: string, ...args: unknown[]): void {
    if (options.debug) {
      logger.log(`[Renderer ANR] ${message}`, ...args);
    }
  }

  const rendererStatusUpdate = async (status: RendererStatus, contents: WebContents): Promise<void> => {
    rendererWatchdogTimers = rendererWatchdogTimers || new Map();

    let watchdog = rendererWatchdogTimers.get(contents);

    if (watchdog === undefined) {
      let pauseAndCapture: (() => void) | undefined;

      if (options.captureStackTrace) {
        log('Connecting to debugger');
        pauseAndCapture = rendererDebugger(contents, (frames) => {
          log('Event captured with stack frames');
          sendRendererAnrEvent(contents, options.anrThreshold, frames);
        });
      }

      watchdog = watchdogTimer(100, options.anrThreshold, async () => {
        log('Watchdog timeout');
        if (pauseAndCapture) {
          log('Pausing debugger to capture stack trace');
          pauseAndCapture();
        } else {
          log('Capturing event');
          sendRendererAnrEvent(contents, options.anrThreshold);
        }
      });

      contents.once('destroyed', () => {
        rendererWatchdogTimers?.delete(contents);
      });

      rendererWatchdogTimers.set(contents, watchdog);
    }

    watchdog.poll();

    if (status !== 'alive') {
      log('Renderer visibility changed', status);
      watchdog.enabled(status === 'visible');
    }
  };

  addStatusListener(rendererStatusUpdate);
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
  /**
   * Renderer process ANR options.
   *
   * Set to false to disable ANR detection in renderer processes.
   */
  rendererProcesses?: Partial<RendererProcessAnrOptions> | false;
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
  if (options.rendererProcesses !== false) {
    const rendererOptions: RendererProcessAnrOptions = {
      anrThreshold: options.rendererProcesses?.anrThreshold || 5000,
      captureStackTrace: !!options.rendererProcesses?.captureStackTrace,
      debug: !!options.rendererProcesses?.debug,
    };

    enableAnrRendererProcesses(rendererOptions);
  }

  if (options.mainProcess !== false) {
    return enableAnrMainProcess(options.mainProcess || {});
  }

  return Promise.resolve();
}
