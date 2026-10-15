export interface Timer {
  getTimeMs: () => number;
  reset: () => void;
}

export interface Watchdog {
  /** Marks the watched process as alive */
  poll: () => void;
  /** Turns the callback on or off. Polling continues either way. */
  enabled: (state: boolean) => void;
  /** Holds the callback until the next `poll()`. `enabled` is kept. */
  suspend: () => void;
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
  let suspended = false;

  const interval = setInterval(() => {
    const diffMs = timer.getTimeMs();

    if (!triggered && diffMs > pollInterval + anrThreshold) {
      triggered = true;
      if (enabled && !suspended) {
        callback();
      }
    }

    if (diffMs < pollInterval + anrThreshold) {
      triggered = false;
    }
  }, 20);

  return {
    poll: () => {
      suspended = false;
      timer.reset();
    },
    enabled: (state: boolean) => {
      enabled = state;
    },
    suspend: () => {
      suspended = true;
    },
    stop: () => {
      clearInterval(interval);
    },
  };
}
