import { parseSemver } from '@sentry/utils';

const version = parseSemver(process.versions.electron);
const major: number = version.major || 0;
const minor: number = version.minor || 0;

/**
 * Electron >=8.4 | >=9.1 | >=10
 * Use `render-process-gone` rather than `crashed`
 */
export function supportsRenderProcessGone(): boolean {
  return (major === 8 && minor >= 4) || (major === 9 && minor >= 1) || major >= 10;
}

/**
 * Electron < 9 requires `crashReporter.start()` in the renderer
 */
export function requiresNativeHandlerRenderer(): boolean {
  return major < 9;
}

/**
 * Electron >= 6 uses crashpad on Windows
 */
export function supportsCrashpadOnWindows(): boolean {
  return major >= 6;
}
