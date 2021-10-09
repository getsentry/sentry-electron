import { Event, StackFrame } from '@sentry/types';
import { join } from 'path';
import { readFileSync } from 'fs';
import * as YAML from 'yaml';
import { spawnSync } from 'child_process';

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

/** Gets the Electron versions to test */
export function getTestVersions(): string[] {
  if (process.env.ELECTRON_VERSION) {
    return [process.env.ELECTRON_VERSION];
  }

  const ciBuildStr = readFileSync(join(__dirname, '..', '.github', 'workflows', 'build.yml'), {
    encoding: 'utf8',
  });

  const ciBuild = YAML.parse(ciBuildStr);

  return ciBuild.jobs.job_4.strategy.matrix.electron;
}

export function getCrashesDirectory(electronPath: string): string {
  const appPath = join(__dirname, 'test-apps', 'crashes-directory');
  const result = spawnSync(electronPath, [appPath], { shell: true, encoding: 'utf-8' });
  return result.output.join('').replace(/[\n\r]/, '');
}
