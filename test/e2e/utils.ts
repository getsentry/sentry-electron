import { SentryEvent, StackFrame } from '@sentry/core';

/** Get stack frames from SentryEvent */
function getFrames(event: SentryEvent): StackFrame[] {
  const stacktrace =
    event.exception && event.exception[0] && event.exception[0].stacktrace;
  return stacktrace && stacktrace.frames ? stacktrace.frames : [];
}

/** Get the last stack frame from SentryEvent */
export function getLastFrame(event: SentryEvent): StackFrame {
  const frames = getFrames(event);
  return frames.length ? frames[frames.length - 1] : { filename: undefined };
}
