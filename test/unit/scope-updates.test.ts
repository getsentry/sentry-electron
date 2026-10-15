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
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    for (let i = 0; i < 1000; i++) {
      scope = i;
      saver.save();
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
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    for (let i = 0; i < 10; i++) {
      scope = i;
      saver.save();
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(save).toHaveBeenCalledTimes(10);
    expect(save).toHaveBeenLastCalledWith(9, 'defaults');
    expect(getDefaults).toHaveBeenCalledTimes(1);
  });

  test('rebuilds the defaults when a save finds them expired', async () => {
    const getDefaults = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const save = vi.fn();
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    saver.save();
    await vi.advanceTimersByTimeAsync(TTL);
    scope = 2;
    saver.save();
    await vi.advanceTimersByTimeAsync(0);

    expect(save).toHaveBeenNthCalledWith(1, 1, 'first');
    expect(save).toHaveBeenNthCalledWith(2, 2, 'second');
  });

  test('refresh rebuilds the defaults and saves without a scope change', async () => {
    const getDefaults = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const save = vi.fn();
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    saver.save();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenLastCalledWith(1, 'first');

    saver.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(1, 'second');
    expect(getDefaults).toHaveBeenCalledTimes(2);
  });

  test('a save in the same turn as refresh is merged into it', async () => {
    const getDefaults = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const save = vi.fn();
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    saver.save();
    await vi.advanceTimersByTimeAsync(0);

    scope = 2;
    saver.save();
    saver.refresh();
    await vi.advanceTimersByTimeAsync(0);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2, 'second');
  });

  test('a slow older run does not write over a newer save', async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    const getDefaults = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue('second');
    const save = vi.fn();
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    saver.save();
    await vi.advanceTimersByTimeAsync(TTL);
    expect(save).not.toHaveBeenCalled();

    scope = 2;
    saver.save();
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
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    saver.save();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).not.toHaveBeenCalled();

    scope = 2;
    saver.save();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2, 'defaults');
    expect(getDefaults).toHaveBeenCalledTimes(2);
  });

  test('a rejecting save does not break later saves', async () => {
    const getDefaults = vi.fn().mockResolvedValue('defaults');
    const save = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue(undefined);
    const saver = createScopeSaver<number, string>(getScope, getDefaults, save, TTL);

    scope = 1;
    saver.save();
    await vi.advanceTimersByTimeAsync(0);
    scope = 2;
    saver.save();
    await vi.advanceTimersByTimeAsync(0);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2, 'defaults');
  });
});
