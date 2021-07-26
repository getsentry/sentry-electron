import { parseSemver } from '@sentry/utils';

/**
 * Parsed Electron version
 */
function version(): { major: number; minor: number; patch: number } {
  const version = parseSemver(process.versions.electron);
  return { major: version.major || 0, minor: version.minor || 0, patch: version.patch || 0 };
}

/**
 * Electron >=8.4 | >=9.1 | >=10
 * Use `render-process-gone` rather than `crashed`
 */
export function supportsRenderProcessGone(): boolean {
  const { major, minor } = version();
  return (major === 8 && minor >= 4) || (major === 9 && minor >= 1) || major >= 10;
}

/**
 * Electron < 9 requires `crashReporter.start()` in the renderer
 */
export function requiresNativeHandlerRenderer(): boolean {
  const { major } = version();
  return major < 9;
}

/**
 * Uses Crashpad on Linux
 * https://github.com/electron/electron/issues/27859
 */
function crashpadLinux(): boolean {
  const { major } = version();

  if (major >= 16) {
    return true;
  }

  const { app } = require('electron');

  return major >= 15 && app.commandLine.hasSwitch('enable-crashpad');
}

/** Is using Crashpad */
export function usesCrashpad(): boolean {
  const { major } = version();
  return (
    process.platform === 'darwin' ||
    (process.platform === 'win32' && major >= 6) ||
    (process.platform === 'linux' && crashpadLinux())
  );
}

/**
 * Electron >= 9 supports `app.getPath('crashDumps')` rather than
 * `crashReporter.getCrashesDirectory()`
 */
export function supportsGetPathCrashDumps(): boolean {
  const { major } = version();
  return major >= 9;
}
