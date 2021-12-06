import { parseSemver } from '@sentry/utils';
import { app, BrowserWindow, crashReporter, WebContents } from 'electron';
import { basename } from 'path';

const parsed = parseSemver(process.versions.electron);
const version = { major: parsed.major || 0, minor: parsed.minor || 0, patch: parsed.patch || 0 };

/** Returns if the app is packaged. Copied from Electron to support < v3 */
export const isPackaged = (() => {
  const execFile = basename(process.execPath).toLowerCase();
  if (process.platform === 'win32') {
    return execFile !== 'electron.exe';
  }
  return execFile !== 'electron';
})();

/** A promise that is resolved when the app is ready */
export const whenAppReady: Promise<void> = (() => {
  return app.isReady()
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        app.once('ready', () => {
          resolve();
        });
      });
})();

/**
 * Electron >= 5 support full protocol API
 */
export function supportsFullProtocol(): boolean {
  return version.major >= 5;
}

export type ExitReason =
  | 'clean-exit'
  | 'abnormal-exit'
  | 'killed'
  | 'crashed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure';

export const CRASH_REASONS: ExitReason[] = ['crashed', 'oom'];
export const ALL_REASONS: ExitReason[] = [
  'clean-exit',
  'abnormal-exit',
  'killed',
  'crashed',
  'oom',
  'launch-failed',
  'integrity-failure',
];

/** Same as the Electron interface but with optional exitCode */
interface RenderProcessGoneDetails {
  /**
   * The reason the render process is gone.  Possible values:
   */
  reason: ExitReason;
  /**
   * The exit code of the process, unless `reason` is `launch-failed`, in which case
   * `exitCode` will be a platform-specific launch failure error code.
   */
  exitCode?: number;
}

/**
 * Implements 'render-process-gone' event across Electron versions
 */
export function onRendererProcessGone(
  reasons: ExitReason[],
  callback: (contents: WebContents, details: RenderProcessGoneDetails) => void,
): void {
  const supportsRenderProcessGone =
    version.major >= 10 || (version.major === 9 && version.minor >= 1) || (version.major === 8 && version.minor >= 4);
  if (supportsRenderProcessGone) {
    app.on('render-process-gone', (_, contents, details) => {
      if (reasons.includes(details.reason)) {
        callback(contents, details);
      }
    });
  } else {
    onWebContentsCreated((contents) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (contents as any).on('crashed', (__: Electron.Event, killed: boolean) => {
        const reason: ExitReason = killed ? 'killed' : 'crashed';

        if (reasons.includes(reason)) {
          callback(contents, { reason });
        }
      });
    });
  }
}

/** Same as the Electron interface but with optional exitCode */
interface Details {
  /**
   * Process type. One of the following values:
   */
  type: 'Utility' | 'Zygote' | 'Sandbox helper' | 'GPU' | 'Pepper Plugin' | 'Pepper Plugin Broker' | 'Unknown';
  /**
   * The reason the child process is gone. Possible values:
   */
  reason: 'clean-exit' | 'abnormal-exit' | 'killed' | 'crashed' | 'oom' | 'launch-failed' | 'integrity-failure';
  /**
   * The exit code for the process (e.g. status from waitpid if on posix, from
   * GetExitCodeProcess on Windows).
   */
  exitCode?: number;
  /**
   * The non-localized name of the process.
   */
  serviceName?: string;
  /**
   * The name of the process. Examples for utility: `Audio Service`, `Content
   * Decryption Module Service`, `Network Service`, `Video Capture`, etc.
   */
  name?: string;
}

/**
 * Calls callback on child process crash if Electron version support 'child-process-gone' event
 */
export function onChildProcessGone(reasons: ExitReason[], callback: (details: Details) => void): void {
  if (version.major >= 11) {
    app.on('child-process-gone', (_, details) => {
      if (reasons.includes(details.reason)) {
        callback(details);
      }
    });
  } else {
    // eslint-disable-next-line deprecation/deprecation
    app.on('gpu-process-crashed', (_, killed) => {
      const reason: ExitReason = killed ? 'killed' : 'crashed';

      if (reasons.includes(reason)) {
        callback({ type: 'GPU', reason });
      }
    });
  }
}

/** Calls callback when BrowserWindow are created */
export function onBrowserWindowCreated(callback: (window: BrowserWindow) => void): void {
  app.on('browser-window-created', (_, window) => {
    // SetImmediate is required for window.id to be correct in older versions of Electron
    // https://github.com/electron/electron/issues/12036
    if (version.major >= 3) {
      callback(window);
    } else {
      setImmediate(() => {
        if (window.isDestroyed()) {
          return;
        }

        callback(window);
      });
    }
  });
}

/** Calls callback when WebContents are created */
export function onWebContentsCreated(callback: (window: WebContents) => void): void {
  app.on('web-contents-created', (_, contents) => {
    // SetImmediate is required for contents.id to be correct in older versions of Electron
    // https://github.com/electron/electron/issues/12036
    if (version.major >= 3) {
      callback(contents);
    } else {
      setImmediate(() => {
        if (contents.isDestroyed()) {
          return;
        }

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
 * Electron >= 9 uses `app.getPath('crashDumps')` rather than
 * `crashReporter.getCrashesDirectory()`
 */
export function getCrashesDirectory(): string {
  return version.major >= 9
    ? app.getPath('crashDumps')
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (crashReporter as any).getCrashesDirectory();
}
