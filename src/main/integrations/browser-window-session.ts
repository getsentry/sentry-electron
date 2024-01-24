import { convertIntegrationFnToClass } from '@sentry/core';
import { IntegrationFn } from '@sentry/types';
import { app, BrowserWindow } from 'electron';

import { ELECTRON_MAJOR_VERSION } from '../electron-normalize';
import { endSession, endSessionOnExit, startSession } from '../sessions';

function focusedWindow(): boolean {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
      // It's important to test both isVisible and isFocused, since
      // Electron v12-13 do not report hidden as a loss of focus
      if (window.isFocused() && window.isVisible()) {
        return true;
      }
    }
  }
  return false;
}

interface Options {
  /**
   * Number of seconds to wait before ending a session after the app loses focus.
   *
   * Default: 10 seconds
   */
  backgroundTimeoutSeconds?: number;
}

// The state can be, active, inactive, or waiting for a timeout
type SessionState = { name: 'active' } | { name: 'inactive' } | { name: 'timeout'; timer: NodeJS.Timeout };

const INTEGRATION_NAME = 'BrowserWindowSession';

const browserWindowSession: IntegrationFn = (options: Options = {}) => {
  if (ELECTRON_MAJOR_VERSION < 12) {
    throw new Error('BrowserWindowSession requires Electron >= v12');
  }

  let _state: SessionState = { name: 'inactive' };

  function windowStateChanged(): void {
    const hasFocusedWindow = focusedWindow();

    if (hasFocusedWindow) {
      // We are now active
      if (_state.name === 'inactive') {
        // If we were inactive, start a new session
        startSession(true);
      } else if (_state.name === 'timeout') {
        // Clear the timeout since the app has become active again
        clearTimeout(_state.timer);
      }

      _state = { name: 'active' };
    } else {
      if (_state.name === 'active') {
        // We have become inactive, start the timeout
        const timeout = (options.backgroundTimeoutSeconds ?? 30) * 1_000;

        const timer = setTimeout(() => {
          // if the state says we're still waiting for the timeout, end the session
          if (_state.name === 'timeout') {
            _state = { name: 'inactive' };
            endSession().catch(() => {
              // ignore
            });
          }
        }, timeout)
          // unref so this timer doesn't block app exit
          .unref();

        _state = { name: 'timeout', timer };
      }
    }
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // noop
    },
    setup() {
      app.on('browser-window-created', (_event, window) => {
        window.on('focus', windowStateChanged);
        window.on('blur', windowStateChanged);
        window.on('show', windowStateChanged);
        window.on('hide', windowStateChanged);

        // when the window is closed we need to remove the listeners
        window.once('closed', () => {
          window.removeListener('focus', windowStateChanged);
          window.removeListener('blur', windowStateChanged);
          window.removeListener('show', windowStateChanged);
          window.removeListener('hide', windowStateChanged);
        });
      });

      // if the app exits while the session is active, end the session
      endSessionOnExit();
    },
  };
};

/**
 * Tracks sessions as BrowserWindows focused.
 *
 * Supports Electron >= v12
 */
// eslint-disable-next-line deprecation/deprecation
export const BrowserWindowSession = convertIntegrationFnToClass(INTEGRATION_NAME, browserWindowSession);
