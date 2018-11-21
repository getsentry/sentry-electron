import { SentryEvent, StackFrame } from '@sentry/types';

/** Get stack frames from SentryEvent */
function getFrames(event: SentryEvent): StackFrame[] {
  const stacktrace =
    event.exception && event.exception.values && event.exception.values[0] && event.exception.values[0].stacktrace;
  return stacktrace && stacktrace.frames ? stacktrace.frames : [];
}

/** Get the last stack frame from SentryEvent */
export function getLastFrame(event: SentryEvent): StackFrame {
  const frames = getFrames(event);
  return frames.length ? frames[frames.length - 1] : { filename: undefined };
}

/** Gets the required architecture version pairs for the current platform */
export function getTests(...versions: string[]): Array<[string, string]> {
  return versions.reduce(
    (prev, curr) => prev.concat(process.platform === 'win32' ? [[curr, 'x64'], [curr, 'ia32']] : [[curr, 'x64']]),
    [] as Array<[string, string]>,
  );
}

export async function delay(timeout: number): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}
