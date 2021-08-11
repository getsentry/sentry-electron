import { Event, StackFrame } from '@sentry/types';

/** Get stack frames from SentryEvent */
function getFrames(event: Event): StackFrame[] {
  const stacktrace =
    event.exception && event.exception.values && event.exception.values[0] && event.exception.values[0].stacktrace;
  return stacktrace && stacktrace.frames ? stacktrace.frames : [];
}

export function isWindowsOnCI(): boolean {
  return process.platform === 'win32' && !!process.env.CI;
}

/** Get the last stack frame from SentryEvent */
export function getLastFrame(event?: Event): StackFrame | undefined {
  if (!event) {
    return;
  }

  const frames = getFrames(event);
  return frames.length ? frames[frames.length - 1] : { filename: undefined };
}
