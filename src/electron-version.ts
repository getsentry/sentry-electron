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
  if (process.platform == 'darwin') {
    return false;
  }

  const { major } = version();
  return major < 9;
}

/**
 * Electron >= 6 uses crashpad on Windows
 */
export function supportsCrashpadOnWindows(): boolean {
  const { major } = version();
  return major >= 6;
}

/**
 * Electron >= 9 supports `app.getPath('crashDumps')` rather than
 * `crashReporter.getCrashesDirectory()`
 */
export function supportsGetPathCrashDumps(): boolean {
  const { major } = version();
  return major >= 9;
}
