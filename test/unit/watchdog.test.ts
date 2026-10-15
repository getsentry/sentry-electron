import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Timer } from '../../src/main/watchdog';
import { createWatchdog } from '../../src/main/watchdog';

const POLL_INTERVAL = 100;
const THRESHOLD = 1000;

/** A timer driven by the fake clock */
function createFakeTimer(): Timer {
  let last = Date.now();

  return {
    getTimeMs: () => Date.now() - last,
    reset: () => {
      last = Date.now();
    },
  };
}

describe('createWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('fires once when polling stops', () => {
    const callback = vi.fn();
    const watchdog = createWatchdog(createFakeTimer, POLL_INTERVAL, THRESHOLD, callback);

    vi.advanceTimersByTime(POLL_INTERVAL + THRESHOLD);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(THRESHOLD * 5);
    expect(callback).toHaveBeenCalledTimes(1);

    watchdog.stop();
  });

  test('does not fire while polled', () => {
    const callback = vi.fn();
    const watchdog = createWatchdog(createFakeTimer, POLL_INTERVAL, THRESHOLD, callback);

    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(POLL_INTERVAL);
      watchdog.poll();
    }

    expect(callback).not.toHaveBeenCalled();
    watchdog.stop();
  });

  test('does not fire while disabled and arms again after recovery', () => {
    const callback = vi.fn();
    const watchdog = createWatchdog(createFakeTimer, POLL_INTERVAL, THRESHOLD, callback);

    watchdog.enabled(false);
    vi.advanceTimersByTime(POLL_INTERVAL + THRESHOLD + 40);
    expect(callback).not.toHaveBeenCalled();

    watchdog.enabled(true);
    watchdog.poll();
    vi.advanceTimersByTime(40);
    vi.advanceTimersByTime(POLL_INTERVAL + THRESHOLD + 40);
    expect(callback).toHaveBeenCalledTimes(1);

    watchdog.stop();
  });

  test('does not fire while suspended and resumes on the next poll', () => {
    const callback = vi.fn();
    const watchdog = createWatchdog(createFakeTimer, POLL_INTERVAL, THRESHOLD, callback);

    watchdog.suspend();
    vi.advanceTimersByTime(POLL_INTERVAL + THRESHOLD + 40);
    expect(callback).not.toHaveBeenCalled();

    watchdog.poll();
    vi.advanceTimersByTime(40);
    vi.advanceTimersByTime(POLL_INTERVAL + THRESHOLD + 40);
    expect(callback).toHaveBeenCalledTimes(1);

    watchdog.stop();
  });

  test('never fires after stop', () => {
    const callback = vi.fn();
    const watchdog = createWatchdog(createFakeTimer, POLL_INTERVAL, THRESHOLD, callback);

    watchdog.stop();
    vi.advanceTimersByTime(POLL_INTERVAL + THRESHOLD + 40);

    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
