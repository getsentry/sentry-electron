import { SentryRequestType } from '@sentry/types';
import { uuid4 } from '@sentry/utils';
import { join } from 'path';

import { readFileAsync, unlinkAsync, writeFileAsync } from '../fs';
import { Store } from '../store';
import { SentryElectronRequest } from './electron-net';

const MILLISECONDS_PER_DAY = 86_400_000;

interface PersistedRequest {
  bodyPath: string;
  type: SentryRequestType;
  date: Date;
}

/** */
export class PersistedRequestQueue {
  private readonly _queue: Store<PersistedRequest[]> = new Store(this._queuePath, 'queue', []);

  public constructor(
    private readonly _queuePath: string,
    private readonly _maxAgeDays: number,
    private readonly _maxCount: number,
  ) {}

  /** */
  public async add(request: SentryElectronRequest): Promise<void> {
    const bodyPath = uuid4();

    let added = false;
    this._queue.update((queue) => {
      if (queue.length < this._maxCount) {
        added = true;
        queue.push({
          bodyPath,
          type: request.type,
          date: request.date || new Date(),
        });
      }
      return queue;
    });

    if (added) {
      await writeFileAsync(join(this._queuePath, bodyPath), request.body);
    }
  }

  /** */
  public async remove(item: PersistedRequest): Promise<void> {
    void this._removeBody(item.bodyPath);

    this._queue.update((q) => {
      const i = q.findIndex((i) => i.bodyPath === item.bodyPath);
      if (i >= 0) q.splice(i, 1);
      return q;
    });
  }

  /** */
  public async first(url: string): Promise<SentryElectronRequest | undefined> {
    let found: PersistedRequest | undefined;
    const cutOff = Date.now() - MILLISECONDS_PER_DAY * this._maxAgeDays;

    this._queue.update((queue) => {
      while ((found = queue.shift())) {
        if (found.date.getTime() < cutOff) {
          found = undefined;
        } else {
          break;
        }
      }
      return queue;
    });

    if (found) {
      try {
        const body = await readFileAsync(join(this._queuePath, found.bodyPath));
        void this._removeBody(found.bodyPath);

        return {
          body,
          date: found.date,
          type: found.type,
          url,
        };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }

    return undefined;
  }

  /** */
  private async _removeBody(bodyPath: string): Promise<void> {
    try {
      await unlinkAsync(join(this._queuePath, bodyPath));
    } catch (_) {
      //
    }
  }
}
