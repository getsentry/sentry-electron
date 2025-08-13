import {
  callFrameToStackFrame,
  captureEvent,
  Client,
  debug,
  defineIntegration,
  Event,
  Integration,
  StackFrame,
  stripSentryFramesAndReverse,
  watchdogTimer,
} from '@sentry/core';
import { createGetModuleFromFilename } from '@sentry/node';
import { app, powerMonitor, WebContents } from 'electron';
import { RendererStatus } from '../../common/ipc.js';
import { ELECTRON_MAJOR_VERSION } from '../electron-normalize.js';
import { addHeaderToSession } from '../header-injection.js';
import { ElectronMainOptionsInternal } from '../sdk.js';
import { sessionAnr } from '../sessions.js';
import { captureRendererStackFrames } from '../stack-parse.js';

function log(message: string, ...args: unknown[]): void {
  debug.log(`[Renderer ANR] ${message}`, ...args);
}

interface ScriptParsedEventDataType {
  scriptId: string;
  url: string;
}

interface Location {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

interface CallFrame {
  functionName: string;
  location: Location;
  url: string;
}

interface PausedEventDataType {
  callFrames: CallFrame[];
  reason: string;
}

type StackFramesCallback = (frames: StackFrame[]) => void;

/**
 * Captures stack frames via the native frame.collectJavaScriptCallStack() API
 */
function nativeStackTraceCapture(contents: WebContents, pausedStack: StackFramesCallback): () => void {
  return () => {
    captureRendererStackFrames(contents)
      .then((frames) => {
        if (frames) {
          pausedStack(frames);
        }
      })
      .catch(() => {
        // ignore
      });
  };
}

/**
 * Captures stack frames via the debugger
 */
function debuggerStackTraceCapture(contents: WebContents, pausedStack: StackFramesCallback): () => void {
  log('Connecting to debugger');
  contents.debugger.attach('1.3');

  // Collect scriptId -> url map so we can look up the filenames later
  const scripts = new Map<string, string>();
  const getModuleFromFilename = createGetModuleFromFilename(app.getAppPath());

  contents.debugger.on('message', (_, method, params) => {
    if (method === 'Debugger.scriptParsed') {
      const param = params as ScriptParsedEventDataType;
      scripts.set(param.scriptId, param.url);
    } else if (method === 'Debugger.paused') {
      const param = params as PausedEventDataType;

      if (param.reason !== 'other') {
        return;
      }

      // copy the frames
      const callFrames = [...param.callFrames];

      contents.debugger.sendCommand('Debugger.resume').then(null, () => {
        // ignore
      });

      const stackFrames = stripSentryFramesAndReverse(
        callFrames.map((frame) =>
          callFrameToStackFrame(frame, scripts.get(frame.location.scriptId), getModuleFromFilename),
        ),
      );

      pausedStack(stackFrames);
    }
  });

  // In node, we enable just before pausing but for Chrome, the debugger must be enabled before he ANR event occurs
  contents.debugger.sendCommand('Debugger.enable').catch(() => {
    // ignore
  });

  return () => {
    if (contents.isDestroyed()) {
      return;
    }

    log('Pausing debugger to capture stack trace');
    return contents.debugger.sendCommand('Debugger.pause');
  };
}

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

const INTEGRATION_NAME = 'RendererAnr';

type Options = {
  /**
   * Enables injection of 'include-js-call-stacks-in-crash-reports' document policy headers so that renderer call stacks
   * can be captured from the main process without using the debugger API.
   *
   * Requires Electron >= v34
   *
   * @default false
   */
  captureNativeStacktrace?: boolean;
};

type RendererStatusHandler = (status: RendererStatus, contents: WebContents) => void;

type RendererAnrIntegration = Integration & {
  createRendererAnrStatusHandler: () => RendererStatusHandler;
};

/**
 * An integration that captures App Not Responding events from renderer processes
 */
export const rendererAnrIntegration: (options?: Options) => RendererAnrIntegration = defineIntegration(
  (options: Options = {}) => {
    const rendererWatchdogTimers = new Map<WebContents, ReturnType<typeof watchdogTimer>>();
    let clientOptions: ElectronMainOptionsInternal | undefined;

    function getRendererName(contents: WebContents): string | undefined {
      return clientOptions?.getRendererName?.(contents);
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

    return {
      name: INTEGRATION_NAME,
      setup: (client) => {
        clientOptions = client.getOptions() as ElectronMainOptionsInternal;

        if (ELECTRON_MAJOR_VERSION >= 34) {
          app.commandLine.appendSwitch('enable-features', 'DocumentPolicyIncludeJSCallStacksInCrashReports');

          if (options.captureNativeStacktrace) {
            app.on('ready', () => {
              clientOptions
                ?.getSessions()
                .forEach((sesh) =>
                  addHeaderToSession(sesh, 'Document-Policy', 'include-js-call-stacks-in-crash-reports'),
                );
            });
          }
        }
      },
      createRendererAnrStatusHandler: (): RendererStatusHandler => {
        return (message: RendererStatus, contents: WebContents): void => {
          let watchdog = rendererWatchdogTimers.get(contents);

          // eslint-disable-next-line jsdoc/require-jsdoc
          function disable(): void {
            watchdog?.enabled(false);
          }

          // eslint-disable-next-line jsdoc/require-jsdoc
          function enable(): void {
            watchdog?.enabled(true);
          }

          if (watchdog === undefined) {
            log('Renderer sent first status message', message.config);
            let pauseAndCapture: (() => void) | undefined;

            if (message.config.captureStackTrace) {
              const stackCaptureImpl =
                options.captureNativeStacktrace && ELECTRON_MAJOR_VERSION >= 34
                  ? nativeStackTraceCapture
                  : debuggerStackTraceCapture;

              pauseAndCapture = stackCaptureImpl(contents, (frames) => {
                log('Event captured with stack frames');
                sendRendererAnrEvent(contents, message.config.anrThreshold, frames);
              });
            }

            watchdog = watchdogTimer(createHrTimer, 100, message.config.anrThreshold, async () => {
              log('Watchdog timeout');
              if (pauseAndCapture) {
                pauseAndCapture();
              } else {
                log('Capturing event');
                sendRendererAnrEvent(contents, message.config.anrThreshold);
              }
            });

            contents.once('destroyed', () => {
              rendererWatchdogTimers?.delete(contents);

              powerMonitor.off('suspend', disable);
              powerMonitor.off('resume', enable);
              powerMonitor.off('lock-screen', disable);
              powerMonitor.off('unlock-screen', enable);
            });

            contents.once('blur', disable);
            contents.once('focus', enable);
            powerMonitor.on('suspend', disable);
            powerMonitor.on('resume', enable);
            powerMonitor.on('lock-screen', disable);
            powerMonitor.on('unlock-screen', enable);

            rendererWatchdogTimers.set(contents, watchdog);
          }

          watchdog.poll();

          if (message.status !== 'alive') {
            log(`Renderer visibility changed '${message.status}'`);
            watchdog.enabled(message.status === 'visible');
          }
        };
      },
    };
  },
) as (options?: Options) => RendererAnrIntegration;

/**
 * Creates a hook which notifies the integration when the state of renderers change
 */
export function createRendererAnrStatusHandler(client: Client): RendererStatusHandler | undefined {
  const integration = client.getIntegrationByName(INTEGRATION_NAME) as RendererAnrIntegration | undefined;
  return integration?.createRendererAnrStatusHandler();
}
