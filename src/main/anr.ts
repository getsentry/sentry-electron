import { callFrameToStackFrame, Event, logger, stripSentryFramesAndReverse, watchdogTimer } from '@sentry/core';
import { captureEvent, createGetModuleFromFilename, getClient, StackFrame } from '@sentry/node';
import { app, powerMonitor, WebContents } from 'electron';

import { RendererStatus } from '../common/ipc';
import { ELECTRON_MAJOR_VERSION } from './electron-normalize';
import { addHeaderToSession } from './header-injection';
import { ElectronMainOptions, ElectronMainOptionsInternal } from './sdk';
import { sessionAnr } from './sessions';
import { captureRendererStackFrames } from './stack-parse';

function log(message: string, ...args: unknown[]): void {
  logger.log(`[Renderer ANR] ${message}`, ...args);
}

function getRendererName(contents: WebContents): string | undefined {
  const options = getClient()?.getOptions() as ElectronMainOptions | undefined;
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

/**
 * Captures stack frames via the native frame.collectJavaScriptCallStack() API
 */
function nativeStackTraceCapture(contents: WebContents, pausedStack: (frames: StackFrame[]) => void): () => void {
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
function debuggerStackTraceCapture(contents: WebContents, pausedStack: (frames: StackFrame[]) => void): () => void {
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
    log('Pausing debugger to capture stack trace');
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

/**
 * Enables renderer ANR
 */
export function configureRendererAnr(options: ElectronMainOptionsInternal): void {
  if (!options.enableRendererStackCapture || ELECTRON_MAJOR_VERSION < 34) {
    return;
  }

  app.commandLine.appendSwitch('enable-features', 'DocumentPolicyIncludeJSCallStacksInCrashReports');

  app.on('ready', () => {
    options
      .getSessions()
      .forEach((sesh) => addHeaderToSession(sesh, 'Document-Policy', 'include-js-call-stacks-in-crash-reports'));
  });
}

/** Creates a renderer ANR status hook */
export function createRendererAnrStatusHandler(
  options: ElectronMainOptionsInternal,
): (status: RendererStatus, contents: WebContents) => void {
  return (message: RendererStatus, contents: WebContents): void => {
    rendererWatchdogTimers = rendererWatchdogTimers || new Map();

    let watchdog = rendererWatchdogTimers.get(contents);

    function disable(): void {
      watchdog?.enabled(false);
    }

    function enable(): void {
      watchdog?.enabled(true);
    }

    if (watchdog === undefined) {
      log('Renderer sent first status message', message.config);
      let pauseAndCapture: (() => void) | undefined;

      if (message.config.captureStackTrace) {
        const stackCaptureImpl =
          options.enableRendererStackCapture && ELECTRON_MAJOR_VERSION >= 34
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
}
