import { TransportRequest } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';
import { join } from 'path';

import { readFileAsync, unlinkAsync, writeFileAsync } from '../fs';
import { Store } from '../store';

const MILLISECONDS_PER_DAY = 86_400_000;

interface PersistedRequest {
  bodyPath: string;
  date: Date;
}

export interface QueuedTransportRequest extends TransportRequest {
  date?: Date;
}

/** A request queue that is persisted to disk to survive app restarts */
export class PersistedRequestQueue {
  private readonly _queue: Store<PersistedRequest[]> = new Store(this._queuePath, 'queue', []);

  public constructor(
    private readonly _queuePath: string,
    private readonly _maxAgeDays: number = 30,
    private readonly _maxCount: number = 30,
  ) {}

  /** Adds a request to the queue */
  public async add(request: QueuedTransportRequest): Promise<void> {
    const bodyPath = uuid4();

    this._queue.update((queue) => {
      queue.push({
        bodyPath,
        date: request.date || new Date(),
      });

      while (queue.length > this._maxCount) {
        const removed = queue.shift();
        if (removed) {
          void this._removeBody(removed.bodyPath);
        }
      }
      return queue;
    });

    try {
      await writeFileAsync(join(this._queuePath, bodyPath), request.body);
    } catch (_) {
      //
    }
  }

  /** Pops the oldest event from the queue */
  public async pop(): Promise<QueuedTransportRequest | undefined> {
    let found: PersistedRequest | undefined;
    const cutOff = Date.now() - MILLISECONDS_PER_DAY * this._maxAgeDays;

    this._queue.update((queue) => {
      while ((found = queue.shift())) {
        if (found.date.getTime() < cutOff) {
          // we're dropping this event so delete the body
          void this._removeBody(found.bodyPath);
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
          // TODO: Waiting on https://github.com/getsentry/sentry-javascript/pull/5004
          body: body.toString(),
          date: found.date || new Date(),
        };
      } catch (e) {
        // eslint-disable-next-line no-console
        logger.warn('Filed to read queued request body', e);
      }
    }

    return undefined;
  }

  /** Removes the body of the request */
  private async _removeBody(bodyPath: string): Promise<void> {
    try {
      await unlinkAsync(join(this._queuePath, bodyPath));
    } catch (_) {
      //
    }
  }
}
