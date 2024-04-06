import { OfflineStore } from '@sentry/core';
import { Envelope } from '@sentry/types';
import { logger, parseEnvelope, serializeEnvelope, uuid4 } from '@sentry/utils';
import { promises as fs } from 'fs';
import { join } from 'path';

import { getSentryCachePath } from '../fs';
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
  const queue = new Store<PersistedRequest[]>(options.queuePath, 'queue-2', []);

  function removeBody(id: string): void {
    fs.unlink(join(options.queuePath, id)).catch(() => {
      // ignore
    });
  }

  function removeStaleRequests(queue: PersistedRequest[]): void {
    while (queue[0] && isOutdated(queue[0], options.maxAgeDays)) {
      const removed = queue.shift() as PersistedRequest;
      log('removing stale', removed);
      removeBody(removed.id);
    }
  }

  return {
    insert: async (env) => {
      logger.log('[offline store] Adding envelope to offline storage');

      const id = uuid4();

      await queue.update(async (queue) => {
        removeStaleRequests(queue);

        if (queue.length >= options.maxQueueSize) {
          return queue;
        }

        try {
          const data = serializeEnvelope(env);
          await fs.mkdir(options.queuePath, { recursive: true });
          await fs.writeFile(join(options.queuePath, id), data);
          queue.push({ id, date: getSentAtFromEnvelope(env) || new Date() });
        } catch (e) {
          log('Failed to save', e);
        }

        return queue;
      });
    },
    pop: async () => {
      let envelope: Envelope | undefined;

      await queue.update(async (queue) => {
        removeStaleRequests(queue);

        const request = queue.shift();
        if (request) {
          try {
            const data = await fs.readFile(join(options.queuePath, request.id));
            removeBody(request.id);
            envelope = parseEnvelope(data);
          } catch (e) {
            log('Failed to read', e);
          }
        }

        return queue;
      });

      return envelope;
    },
  };
}
