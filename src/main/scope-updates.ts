import { debug } from '@sentry/core';

/**
 * Creates a function that schedules a save of the current scope together
 * with event defaults that are at most `ttlMs` old.
 *
 * Calls in one event loop turn are merged into one save on the next
 * turn, and the scope is read once when that save runs. The defaults
 * are rebuilt only when a save finds them expired. A save that used
 * cached defaults arms one timer so the saved data catches up once they
 * expire. This matters because some context, such as screen and GPU
 * details, only exists after the app is ready.
 */
export function createScopeSaver<TScope, TDefaults>(
  getScope: () => TScope,
  getDefaults: () => Promise<TDefaults>,
  save: (scope: TScope, defaults: TDefaults) => void | Promise<void>,
  ttlMs: number,
): () => void {
  let scheduled = false;
  let runs = 0;
  let defaults: Promise<TDefaults> | undefined;
  let expires = 0;
  let refresh: NodeJS.Timeout | undefined;

  function schedule(): void {
    if (scheduled) {
      return;
    }

    scheduled = true;

    // Deferring to the next turn ensures that the first save does not
    // beat the initial async read of the store
    // https://github.com/getsentry/sentry-electron/issues/585
    setImmediate(() => {
      run().catch((error) => debug.error(error));
    });
  }

  async function run(): Promise<void> {
    scheduled = false;
    const thisRun = ++runs;
    const scope = getScope();
    const now = Date.now();

    if (!defaults || now >= expires) {
      const current = getDefaults();
      defaults = current;
      expires = now + ttlMs;

      current.catch(() => {
        if (defaults === current) {
          defaults = undefined;
        }
      });
    } else if (!refresh) {
      refresh = setTimeout(() => {
        refresh = undefined;
        schedule();
      }, expires - now);
      refresh.unref();
    }

    const resolved = await defaults;

    // A newer run holds a newer scope, so a slow older one must not
    // write over it
    if (thisRun !== runs) {
      return;
    }

    await save(scope, resolved);
  }

  return schedule;
}
