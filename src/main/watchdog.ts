export interface Timer {
  getTimeMs: () => number;
  reset: () => void;
}

export interface Watchdog {
  /** Marks the watched process as alive */
  poll: () => void;
  /** Turns the callback on or off. Polling continues either way. */
  enabled: (state: boolean) => void;
  /**
   * Holds the callback until `resume()` or until two more polls arrive.
   * `enabled` is kept. Two polls, because one message from a crashed
   * process can still be in flight when the hold starts.
   */
  suspend: () => void;
  /** Lifts a hold at once */
  resume: () => void;
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
  let pollsUntilResume = 0;

  const interval = setInterval(() => {
    const diffMs = timer.getTimeMs();

    if (!triggered && diffMs > pollInterval + anrThreshold) {
      triggered = true;
      if (enabled && pollsUntilResume === 0) {
        callback();
      }
    }

    if (diffMs < pollInterval + anrThreshold) {
      triggered = false;
    }
  }, 20);

  return {
    poll: () => {
      if (pollsUntilResume > 0) {
        pollsUntilResume -= 1;
      }
      timer.reset();
    },
    enabled: (state: boolean) => {
      enabled = state;
    },
    suspend: () => {
      pollsUntilResume = 2;
    },
    resume: () => {
      pollsUntilResume = 0;
    },
    stop: () => {
      clearInterval(interval);
    },
  };
}
