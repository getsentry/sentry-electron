import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createScopeSaver } from '../../src/main/scope-updates';

const TTL = 1000;

describe('createScopeSaver', () => {
  let scope = 0;
  const getScope = vi.fn(() => scope);

  beforeEach(() => {
    vi.useFakeTimers();
    scope = 0;
    getScope.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('merges synchronous changes into one save and reads the scope once', async () => {
    const getDefaults = vi.fn().mockResolvedValue('defaults');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    for (let i = 0; i < 1000; i++) {
      scope = i;
      update();
    }

    expect(getScope).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(getScope).toHaveBeenCalledTimes(1);
    expect(getDefaults).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(999, 'defaults');
  });

  test('saves on each turn but builds the defaults once within the ttl', async () => {
    const getDefaults = vi.fn().mockResolvedValue('defaults');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    for (let i = 0; i < 10; i++) {
      scope = i;
      update();
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(save).toHaveBeenCalledTimes(10);
    expect(save).toHaveBeenLastCalledWith(9, 'defaults');
    expect(getDefaults).toHaveBeenCalledTimes(1);
  });

  test('rebuilds the defaults when a save finds them expired', async () => {
    const getDefaults = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    update();
    await vi.advanceTimersByTimeAsync(TTL);
    scope = 2;
    update();
    await vi.advanceTimersByTimeAsync(0);

    expect(save).toHaveBeenNthCalledWith(1, 1, 'first');
    expect(save).toHaveBeenNthCalledWith(2, 2, 'second');
  });

  test('saves once more with fresh defaults after the ttl when cached defaults were used', async () => {
    const getDefaults = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    update();
    await vi.advanceTimersByTimeAsync(100);
    scope = 2;
    update();
    scope = 3;
    update();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(3, 'first');

    await vi.advanceTimersByTimeAsync(TTL);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith(3, 'second');
    expect(getDefaults).toHaveBeenCalledTimes(2);

    // Nothing else is pending once the data has caught up
    await vi.advanceTimersByTimeAsync(TTL * 2);
    expect(save).toHaveBeenCalledTimes(3);
  });

  test('does not arm a catch-up save when the defaults were just built', async () => {
    const getDefaults = vi.fn().mockResolvedValue('defaults');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    update();
    await vi.advanceTimersByTimeAsync(TTL * 2);

    expect(save).toHaveBeenCalledTimes(1);
    expect(getDefaults).toHaveBeenCalledTimes(1);
  });

  test('a slow older run does not write over a newer save', async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    const getDefaults = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue('second');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    update();
    await vi.advanceTimersByTimeAsync(TTL);
    expect(save).not.toHaveBeenCalled();

    scope = 2;
    update();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2, 'second');

    resolveFirst('first');
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('does not cache rejected defaults', async () => {
    const getDefaults = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue('defaults');
    const save = vi.fn();
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    update();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).not.toHaveBeenCalled();

    scope = 2;
    update();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2, 'defaults');
    expect(getDefaults).toHaveBeenCalledTimes(2);
  });

  test('a rejecting save does not break later saves', async () => {
    const getDefaults = vi.fn().mockResolvedValue('defaults');
    const save = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue(undefined);
    const update = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    update();
    await vi.advanceTimersByTimeAsync(0);
    scope = 2;
    update();
    await vi.advanceTimersByTimeAsync(0);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2, 'defaults');
  });
});
