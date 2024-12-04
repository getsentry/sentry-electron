import { Envelope, logger, OfflineStore, parseEnvelope, serializeEnvelope, uuid4 } from '@sentry/core';
import { promises as fs } from 'fs';
import { join } from 'path';

import { getSentryCachePath } from '../electron-normalize';
import { Store } from '../store';

/** Internal type used to expose the envelope date without having to read it into memory */
interface PersistedRequest {
  id: string;
  date: Date;
}

export interface OfflineStoreOptions {
  /**
   * Path to the offline queue directory.
   */
  queuePath: string;
  /**
   * Maximum number of days to store requests.
   */
  maxAgeDays: number;
  /**
   * Maximum number of requests to store.
   */
  maxQueueSize: number;
}

const MILLISECONDS_PER_DAY = 86_400_000;

function isOutdated(request: PersistedRequest, maxAgeDays: number): boolean {
  const cutOff = Date.now() - MILLISECONDS_PER_DAY * maxAgeDays;
  return request.date.getTime() < cutOff;
}

function getSentAtFromEnvelope(envelope: Envelope): Date | undefined {
  const header = envelope[0];
  if (typeof header.sent_at === 'string') {
    return new Date(header.sent_at);
  }
  return undefined;
}

/**
 * Creates a new offline store.
 */
export function createOfflineStore(userOptions: Partial<OfflineStoreOptions>): OfflineStore {
  function log(...args: unknown[]): void {
    logger.log(`[Offline Store]:`, ...args);
  }

  const options: OfflineStoreOptions = {
    maxAgeDays: userOptions.maxAgeDays || 30,
    maxQueueSize: userOptions.maxQueueSize || 30,
    queuePath: userOptions.queuePath || join(getSentryCachePath(), 'queue'),
  };

  const queue = new Store<PersistedRequest[]>(options.queuePath, 'queue-v2', []);

  function removeBody(id: string): void {
    fs.unlink(join(options.queuePath, id)).catch(() => {
      // ignore
    });
  }

  function removeStaleRequests(queue: PersistedRequest[]): void {
    while (queue[0] && isOutdated(queue[0], options.maxAgeDays)) {
      const removed = queue.shift() as PersistedRequest;
      log('Removing stale envelope', removed);
      removeBody(removed.id);
    }
  }

  async function insert(env: Envelope, which: 'push' | 'unshift', previousDate?: Date): Promise<void> {
    log(`${which}ing envelope into offline storage`);

    const id = uuid4();

    try {
      const data = serializeEnvelope(env);
      await fs.mkdir(options.queuePath, { recursive: true });
      await fs.writeFile(join(options.queuePath, id), data);
    } catch (e) {
      log('Failed to save', e);
    }

    await queue.update((queue) => {
      if (which === 'push') {
        removeStaleRequests(queue);

        if (queue.length >= options.maxQueueSize) {
          removeBody(id);
          return queue;
        }
      }

      queue[which]({ id, date: previousDate || getSentAtFromEnvelope(env) || new Date() });

      return queue;
    });
  }

  // We store the timestamp for the last envelope that was shifted out so that if it gets unshifted back in
  // it can keep its original date
  let lastShiftedDate: Date | undefined;

  return {
    push: async (env) => {
      await insert(env, 'push');
    },
    unshift: async (env) => {
      await insert(env, 'unshift', lastShiftedDate);
    },
    shift: async () => {
      log('Popping envelope from offline storage');
      let request: PersistedRequest | undefined;
      await queue.update((queue) => {
        removeStaleRequests(queue);
        request = queue.shift();
        return queue;
      });

      if (request) {
        try {
          const data = await fs.readFile(join(options.queuePath, request.id));
          removeBody(request.id);
          lastShiftedDate = request.date;
          return parseEnvelope(data);
        } catch (e) {
          log('Failed to read', e);
        }
      }

      return undefined;
    },
  };
}
