import type { EventEmitter } from 'events';

type Listener = (...args: unknown[]) => void;
type WrappedListener = Listener & { listener: Listener };
type AddMethod = 'on' | 'addListener' | 'prependListener' | 'once' | 'prependOnceListener';

/**
 * Hides messages that `shouldHide` matches from every listener added to
 * `emitter` for `eventName`.
 *
 * Each wrapper carries a `listener` property that points at the caller's
 * function. Node's `removeListener` and `listeners()` look through that
 * property, so `off` and `listeners()` behave as on a plain emitter.
 * `once` is handled here rather than left to Node, because Node's `once`
 * calls `on` and its own wrapper would then be wrapped a second time.
 */
export function hideMatchingMessages(
  emitter: EventEmitter,
  eventName: string,
  shouldHide: (message: unknown) => boolean,
): void {
  const originalOn = emitter.on.bind(emitter);
  const originalPrepend = emitter.prependListener.bind(emitter);

  function wrap(listener: Listener, once: boolean): WrappedListener {
    const wrapper = function (this: unknown, ...args: unknown[]): void {
      if (shouldHide(args[0])) {
        return;
      }

      if (once) {
        emitter.removeListener(eventName, wrapper);
      }

      listener.apply(this, args);
    } as WrappedListener;

    wrapper.listener = listener;
    return wrapper;
  }

  function install(method: AddMethod, register: EventEmitter['on'], once: boolean): void {
    const existing = emitter[method].bind(emitter);

    emitter[method] = (name: string | symbol, listener: Listener): EventEmitter => {
      if (name !== eventName) {
        return existing(name, listener);
      }

      return register(name, wrap(listener, once));
    };
  }

  install('on', originalOn, false);
  install('addListener', originalOn, false);
  install('prependListener', originalPrepend, false);
  install('once', originalOn, true);
  install('prependOnceListener', originalPrepend, true);
}
