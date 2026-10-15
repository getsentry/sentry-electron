export interface Timer {
  getTimeMs: () => number;
  reset: () => void;
}

export interface Watchdog {
  /** Marks the watched process as alive */
  poll: () => void;
  /** Turns the callback on or off. Polling continues either way. */
  enabled: (state: boolean) => void;
  /** Stops the watchdog. It cannot be restarted. */
  stop: () => void;
}

/**
 * Calls `callback` once when more than `pollInterval + anrThreshold` ms
 * pass without a `poll()`. It arms again once polling resumes.
 */
export function createWatchdog(
  createTimer: () => Timer,
  pollInterval: number,
  anrThreshold: number,
  callback: () => void,
): Watchdog {
  const timer = createTimer();
  let triggered = false;
  let enabled = true;

  const interval = setInterval(() => {
    const diffMs = timer.getTimeMs();

    if (!triggered && diffMs > pollInterval + anrThreshold) {
      triggered = true;
      if (enabled) {
        callback();
      }
    }

    if (diffMs < pollInterval + anrThreshold) {
      triggered = false;
    }
  }, 20);

  // Not unref'd on purpose. In the Electron main process libuv only runs
  // timers while a referenced handle exists, so an unref'd interval can
  // stall when the app is otherwise idle.

  return {
    poll: () => {
      timer.reset();
    },
    enabled: (state: boolean) => {
      enabled = state;
    },
    stop: () => {
      clearInterval(interval);
    },
  };
}
