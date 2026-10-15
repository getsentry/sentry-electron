import type { Client, Event, Integration, StackFrame } from '@sentry/core';
import { captureEvent, debug, defineIntegration, stripSentryFramesAndReverse } from '@sentry/core';
import { callFrameToStackFrame } from '@sentry/core/server';
import { createGetModuleFromFilename } from '@sentry/node';
import type { WebContents } from 'electron';
import { app, powerMonitor } from 'electron';
import type { RendererStatus } from '../../common/ipc.js';
import { addHeaderToSession } from '../header-injection.js';
import type { ElectronMainOptionsInternal } from '../sdk.js';
import { sessionAnr } from '../sessions.js';
import { captureRendererStackFrames } from '../stack-parse.js';
import type { Watchdog } from '../watchdog.js';
import { createWatchdog } from '../watchdog.js';

function log(message: string, ...args: unknown[]): void {
  debug.log(`[Renderer Event Loop Block] ${message}`, ...args);
}

// Upper bound for the scriptId -> url map of one renderer. Each eval
// parses a new script, so without a bound the map grows for the life
// of the renderer.
const MAX_TRACKED_SCRIPTS = 10_000;

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

  // Collect scriptId -> url map so we can look up the filenames later.
  // Paused call frames do not carry a url in Electron.
  const scripts = new Map<string, string>();
  const getModuleFromFilename = createGetModuleFromFilename(app.getAppPath());

  // A new document parses its own scripts, so the old ones are gone
  contents.on('did-navigate', () => scripts.clear());

  contents.debugger.on('message', (_, method, params) => {
    if (method === 'Debugger.scriptParsed') {
      const param = params as ScriptParsedEventDataType;

      if (scripts.size >= MAX_TRACKED_SCRIPTS) {
        const oldest = scripts.keys().next();
        if (!oldest.done) {
          scripts.delete(oldest.value);
        }
      }

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
    contents.debugger.sendCommand('Debugger.pause').catch(() => {
      // ignore
    });
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

const INTEGRATION_NAME = 'RendererEventLoopBlock';

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

type RendererEventLoopBlockIntegration = Integration & {
  createRendererEventLoopBlockStatusHandler: () => RendererStatusHandler;
};

/**
 * An integration that captures App Not Responding events from renderer processes
 */
export const rendererEventLoopBlockIntegration: (options?: Options) => RendererEventLoopBlockIntegration =
  defineIntegration((options: Options = {}) => {
    const rendererWatchdogTimers = new Map<WebContents, Watchdog>();
    let clientOptions: ElectronMainOptionsInternal | undefined;

    function getRendererName(contents: WebContents): string | undefined {
      return clientOptions?.getRendererName?.(contents);
    }

    function sendRendererEventLoopBlockEvent(contents: WebContents, blockedMs: number, frames?: StackFrame[]): void {
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

    function startWatchdog(contents: WebContents, config: RendererStatus['config']): Watchdog {
      let pauseAndCapture: (() => void) | undefined;

      if (config.captureStackTrace) {
        const stackCaptureImpl = options.captureNativeStacktrace ? nativeStackTraceCapture : debuggerStackTraceCapture;

        pauseAndCapture = stackCaptureImpl(contents, (frames) => {
          log('Event captured with stack frames');
          sendRendererEventLoopBlockEvent(contents, config.anrThreshold, frames);
        });
      }

      const watchdog = createWatchdog(createHrTimer, 100, config.anrThreshold, () => {
        log('Watchdog timeout');
        if (pauseAndCapture) {
          pauseAndCapture();
        } else {
          log('Capturing event');
          sendRendererEventLoopBlockEvent(contents, config.anrThreshold);
        }
      });

      const disable = (): void => watchdog.enabled(false);
      const enable = (): void => watchdog.enabled(true);

      // A destroyed webContents never polls again, so the watchdog must
      // stop too or it reports a block that never happened
      const teardown = (): void => {
        watchdog.stop();
        rendererWatchdogTimers.delete(contents);

        if (!contents.isDestroyed()) {
          contents.off('blur', disable);
          contents.off('focus', enable);
          contents.off('render-process-gone', disable);
        }

        powerMonitor.off('suspend', disable);
        powerMonitor.off('resume', enable);
        powerMonitor.off('lock-screen', disable);
        powerMonitor.off('unlock-screen', enable);
      };

      contents.on('blur', disable);
      contents.on('focus', enable);
      // A crashed renderer stops polling until it is reloaded. The
      // reloaded page sends its visibility, which enables the watchdog
      // again, so the watchdog and the debugger session are kept.
      contents.on('render-process-gone', disable);
      contents.once('destroyed', teardown);
      powerMonitor.on('suspend', disable);
      powerMonitor.on('resume', enable);
      powerMonitor.on('lock-screen', disable);
      powerMonitor.on('unlock-screen', enable);

      return watchdog;
    }

    return {
      name: INTEGRATION_NAME,
      setup: (client) => {
        clientOptions = client.getOptions() as ElectronMainOptionsInternal;

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
      },
      createRendererEventLoopBlockStatusHandler: (): RendererStatusHandler => {
        return (message: RendererStatus, contents: WebContents): void => {
          let watchdog = rendererWatchdogTimers.get(contents);

          if (watchdog === undefined) {
            log('Renderer sent first status message', message.config);
            watchdog = startWatchdog(contents, message.config);
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
  }) as (options?: Options) => RendererEventLoopBlockIntegration;

/**
 * Creates a hook which notifies the integration when the state of renderers change
 */
export function createRendererEventLoopBlockStatusHandler(client: Client): RendererStatusHandler | undefined {
  const integration = client.getIntegrationByName(INTEGRATION_NAME) as unknown as
    | RendererEventLoopBlockIntegration
    | undefined;
  return integration?.createRendererEventLoopBlockStatusHandler();
}
