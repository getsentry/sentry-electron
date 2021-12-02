import { API } from '@sentry/core';
import { NodeOptions } from '@sentry/node';
import { Event, Transport } from '@sentry/types';
import { isThenable, logger, SentryError, timestampWithMs } from '@sentry/utils';
import { basename } from 'path';

import { readFileAsync, statAsync, unlinkAsync } from '../../fs';
import { ElectronNetTransport, SentryElectronRequest } from '../../transports/electron-net';

/** Maximum number of days to keep a minidump before deleting it. */
const MAX_AGE = 30;

/**
 * Payload for a minidump request comprising a persistent file system path and
 * event metadata.
 */
export interface MinidumpRequest {
  /** Path to the minidump file. */
  path: string;
  /** Associated event data. */
  event: Event | null;
}

/**
 * A service that discovers Minidump crash reports and uploads them to Sentry.
 */
export abstract class BaseUploader {
  /** List of minidumps that have been found already. */
  private readonly _knownPaths: string[];

  /** API object */
  private readonly _api: API;

  /**
   * Creates a new uploader instance.
   */
  public constructor(private readonly _options: NodeOptions, private readonly _transport: Transport) {
    this._knownPaths = [];

    if (!_options.dsn) {
      throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
    }

    this._api = new API(_options.dsn);
  }

  /**
   * Uploads a minidump file to Sentry.
   *
   * @param path Absolute path to the minidump file.
   * @param event Event data to attach to the minidump.
   * @returns A promise that resolves when the upload is complete.
   */
  public async uploadMinidump(request: MinidumpRequest): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof (this._transport as any).sendRequest !== 'function') {
      logger.warn("Your transport doesn't implement sendRequest");
      logger.warn('Skipping sending minidump');
      return;
    }

    // The beforeSend callback can set the event as null
    if (this._options.beforeSend && request.event) {
      const maybePromiseResult = this._options.beforeSend(request.event);

      const result = await (isThenable(maybePromiseResult)
        ? (maybePromiseResult as PromiseLike<Event | null>).then((e) => e)
        : Promise.resolve(maybePromiseResult));

      if (result === null) {
        logger.warn('`beforeSend` returned `null`, will not send minidump.');
        request.event = null;
      }
    }

    const transport = this._transport as ElectronNetTransport;
    try {
      if (request.event && !transport.isRateLimited('event')) {
        logger.log('Sending minidump', request.path);
        const requestForTransport = await this._toMinidumpRequest(transport, request.event, request.path);
        await transport.sendRequest(requestForTransport);
        logger.log('Minidump sent');
      }

      // We either succeeded, something went wrong or the send was aborted. Either way, we can remove the minidump file.
      try {
        await unlinkAsync(request.path);
        logger.log('Deleted minidump', request.path);
      } catch (e) {
        logger.warn('Could not delete', request.path, e);
      }

      // Forget this minidump in all caches
      this._knownPaths.splice(this._knownPaths.indexOf(request.path), 1);
    } catch (err) {
      // TODO: Test this
      logger.warn('Failed to upload minidump', err);
    }
  }

  /**
   * Searches for new, unknown minidump files in the crash directory.
   * @returns A promise that resolves to absolute paths of those dumps.
   */
  public async getNewMinidumps(): Promise<string[]> {
    const minidumps = await this._getMinidumpPaths();
    logger.log(`Found ${minidumps.length} minidumps`);

    const oldestMs = new Date().getTime() - MAX_AGE * 24 * 3_600 * 1_000;
    return this._filterAsync(minidumps, async (path) => {
      // Skip files that we have seen before
      if (this._knownPaths.indexOf(path) >= 0) {
        return false;
      }

      // Lock this minidump until we have uploaded it or an error occurs and we
      // remove it from the file system.
      this._knownPaths.push(path);

      // We do not want to upload minidumps that have been generated before a
      // certain threshold. Those old files can be deleted immediately.
      const stats = await statAsync(path);
      if (stats.birthtimeMs < oldestMs) {
        try {
          await unlinkAsync(path);
        } catch (e) {
          logger.warn('Could not delete', path);
        }
        this._knownPaths.splice(this._knownPaths.indexOf(path), 1);
        return false;
      }

      return true;
    });
  }

  /**
   * Helper to filter an array with asynchronous callbacks.
   *
   * @param array An array containing items to filter.
   * @param predicate An async predicate evaluated on every item.
   * @param thisArg Optional value passed as "this" into the callback.
   * @returns An array containing only values where the callback returned true.
   */
  private async _filterAsync<T>(
    array: T[],
    predicate: (item: T) => Promise<boolean> | boolean,
    thisArg?: any,
  ): Promise<T[]> {
    const verdicts = await Promise.all(array.map(predicate, thisArg));
    return array.filter((_, index) => verdicts[index]);
  }

  /**
   * Create minidump request to dispatch to the transport
   */
  private async _toMinidumpRequest(
    transport: ElectronNetTransport,
    event: Event,
    minidumpPath: string,
  ): Promise<SentryElectronRequest> {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      // Internal helper that uses `perf_hooks` to get clock reading
      sent_at: new Date(timestampWithMs() * 1_000).toISOString(),
    });

    // If attachments are rate-limited we add this hint so users know
    if (transport.isRateLimited('attachment')) {
      event.message = 'Ratelimited - Minidump Event';
    }

    const itemHeaders = JSON.stringify({
      content_type: 'application/json',
      type: 'event',
    });

    const eventPayload = JSON.stringify(event);
    let bodyBuffer = Buffer.from(`${envelopeHeaders}\n${itemHeaders}\n${eventPayload}\n`);

    // Only add attachment if they are not rate limited
    if (!transport.isRateLimited('attachment')) {
      let minidumpContent = (await readFileAsync(minidumpPath)) as Buffer;

      // Breakpad has custom parsing
      minidumpContent = (await this._preProcessFile?.(minidumpContent)) || minidumpContent;

      const minidumpHeader = JSON.stringify({
        attachment_type: 'event.minidump',
        length: minidumpContent.length,
        type: 'attachment',
        filename: basename(minidumpPath),
      });

      bodyBuffer = Buffer.concat([bodyBuffer, Buffer.from(`${minidumpHeader}\n`), minidumpContent, Buffer.from('\n')]);
    } else {
      logger.warn('Will not add minidump to request since they are rate limited.');
    }

    return {
      url: this._api.getEnvelopeEndpointWithUrlEncodedAuth(),
      body: bodyBuffer,
      type: 'event',
    };
  }

  protected abstract _getMinidumpPaths(): Promise<string[]>;

  protected abstract _preProcessFile(file: Buffer): Buffer | undefined;
}
