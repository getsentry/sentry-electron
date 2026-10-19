import { EventEmitter } from 'events';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { hideMatchingMessages } from '../../src/main/filter-listeners';

const HIDDEN = { hidden: true };
const isHidden = (message: unknown): boolean => message === HIDDEN;

describe('hideMatchingMessages', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    hideMatchingMessages(emitter, 'message', isHidden);
  });

  test('off removes a listener added with on', () => {
    const before = emitter.listenerCount('message');

    for (let i = 0; i < 1000; i++) {
      const listener = (): void => undefined;
      emitter.on('message', listener);
      emitter.off('message', listener);
    }

    expect(emitter.listenerCount('message')).toBe(before);
  });

  test.each(['on', 'addListener', 'prependListener', 'once', 'prependOnceListener'] as const)(
    '%s hides matching messages and passes the rest through',
    (method) => {
      const listener = vi.fn();
      emitter[method]('message', listener);

      emitter.emit('message', HIDDEN);
      expect(listener).not.toHaveBeenCalled();

      emitter.emit('message', 'visible');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('visible');
    },
  );

  test('listeners are called with the emitter as this', () => {
    const listener = vi.fn(function (this: unknown) {
      expect(this).toBe(emitter);
    });
    emitter.on('message', listener);

    emitter.emit('message', 'visible');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('once fires once and removes itself', () => {
    const listener = vi.fn();
    emitter.once('message', listener);

    emitter.emit('message', 'first');
    emitter.emit('message', 'second');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('first');
    expect(emitter.listenerCount('message')).toBe(0);
  });

  test('a hidden message does not consume a once listener', () => {
    const listener = vi.fn();
    emitter.once('message', listener);

    emitter.emit('message', HIDDEN);
    expect(emitter.listenerCount('message')).toBe(1);

    emitter.emit('message', 'visible');
    expect(listener).toHaveBeenCalledWith('visible');
  });

  test('off removes a pending once listener', () => {
    const listener = vi.fn();
    emitter.once('message', listener);
    emitter.off('message', listener);

    emitter.emit('message', 'visible');
    expect(listener).not.toHaveBeenCalled();
    expect(emitter.listenerCount('message')).toBe(0);
  });

  test('prependListener runs before earlier listeners', () => {
    const order: string[] = [];
    emitter.on('message', () => order.push('first'));
    emitter.prependListener('message', () => order.push('prepended'));

    emitter.emit('message', 'visible');
    expect(order).toEqual(['prepended', 'first']);
  });

  test('listeners() returns the original functions', () => {
    const a = (): void => undefined;
    const b = (): void => undefined;
    emitter.on('message', a);
    emitter.once('message', b);

    expect(emitter.listeners('message')).toEqual([a, b]);
  });

  test('other events are untouched', () => {
    const listener = vi.fn();
    emitter.on('exit', listener);
    emitter.once('exit', listener);

    emitter.emit('exit', HIDDEN);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(HIDDEN);

    emitter.off('exit', listener);
    expect(emitter.listenerCount('exit')).toBe(0);
  });
});
