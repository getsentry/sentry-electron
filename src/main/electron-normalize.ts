import { parseSemver } from '@sentry/utils';
import { app, crashReporter, RenderProcessGoneDetails, WebContents } from 'electron';

const parsed = parseSemver(process.versions.electron);
const version = { major: parsed.major || 0, minor: parsed.minor || 0, patch: parsed.patch || 0 };

/**
 * Electron >=8.4 | >=9.1 | >=10
 * Use `render-process-gone` rather than `crashed`
 */
function supportsRenderProcessGone(): boolean {
  return (
    version.major >= 10 || (version.major === 9 && version.minor >= 1) || (version.major === 8 && version.minor >= 4)
  );
}

/**
 * Implements 'render-process-gone' event across Electron versions
 */
export function onRendererProcessGone(
  callback: (contents: WebContents, details?: RenderProcessGoneDetails) => void,
): void {
  app.on('web-contents-created', (_, contents) => {
    if (supportsRenderProcessGone()) {
      contents.on('render-process-gone', async (__, details) => {
        callback(contents, details);
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (contents as any).on('crashed', async () => {
        callback(contents);
      });
    }
  });
}

/**
 * Electron < 9 requires `crashReporter.start()` in the renderer
 */
export function rendererRequiresCrashReporterStart(): boolean {
  if (process.platform === 'darwin') {
    return false;
  }

  return version.major < 9;
}

/**
 * Uses Crashpad on Linux
 * https://github.com/electron/electron/issues/27859
 */
function crashpadLinux(): boolean {
  if (version.major >= 16) {
    return true;
  }

  if (version.major < 15) {
    return false;
  }

  // Crashpad Linux for v15 is behind a switch
  return app.commandLine.hasSwitch('enable-crashpad');
}

/** Is using Crashpad */
export function usesCrashpad(): boolean {
  return (
    process.platform === 'darwin' ||
    (process.platform === 'win32' && version.major >= 6) ||
    (process.platform === 'linux' && crashpadLinux())
  );
}

/**
 * Electron >= 9 supports `app.getPath('crashDumps')` rather than
 * `crashReporter.getCrashesDirectory()`
 */
export function getCrashesDirectory(): string {
  return version.major >= 9
    ? app.getPath('crashDumps')
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (crashReporter as any).getCrashesDirectory();
}
