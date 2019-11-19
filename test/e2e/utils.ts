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
export function getLastFrame(event: Event): StackFrame {
  const frames = getFrames(event);
  return frames.length ? frames[frames.length - 1] : { filename: undefined };
}

/** Gets the required architecture version pairs for the current platform */
export function getTests(...versions: string[]): Array<[string, string]> {
  return versions.reduce(
    (prev, curr) =>
      prev.concat(
        // We dont run both architectures on Windows CI because it takes too long
        process.platform === 'win32' && !isWindowsOnCI()
          ? [
              [curr, 'x64'],
              [curr, 'ia32'],
            ]
          : [[curr, 'x64']],
      ),
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
