import { captureEvent, createGetModuleFromFilename, getClient, NodeClient, StackFrame } from '@sentry/node';
import { Event } from '@sentry/types';
import { callFrameToStackFrame, logger, stripSentryFramesAndReverse, watchdogTimer } from '@sentry/utils';
import { app, WebContents } from 'electron';
import { sep } from 'path';

import { RendererStatus } from '../common';
import { Anr } from './integrations/anr';
import { ElectronMainOptions } from './sdk';
import { sessionAnr } from './sessions';

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

function rendererDebugger(contents: WebContents, pausedStack: (frames: StackFrame[]) => void): () => void {
  contents.debugger.attach('1.3');

  // Collect scriptId -> url map so we can look up the filenames later
  const scripts = new Map<string, string>();
  const getModuleFromFilename = createGetModuleFromFilename(app.getAppPath() + sep);

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

interface LegacyOptions {
  entryScript: string;
  pollInterval: number;
  anrThreshold: number;
  captureStackTrace: boolean;
  debug: boolean;
}

/**
 * @deprecated Use `Anr` integration instead.
 *
 * ```js
 * import { init, Integrations } from '@sentry/electron';
 *
 * init({
 *   dsn: "__DSN__",
 *   integrations: [new Integrations.Anr({ captureStackTrace: true })],
 * });
 * ```
 */
export function enableMainProcessAnrDetection(options: Partial<LegacyOptions> = {}): Promise<void> {
  const integration = new Anr(options);
  const client = getClient() as NodeClient;
  integration.setup?.(client);
  return Promise.resolve();
}
