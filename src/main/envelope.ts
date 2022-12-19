import {
  Attachment,
  AttachmentItem,
  BaseEnvelopeHeaders,
  BaseEnvelopeItemHeaders,
  Envelope,
  Event,
  EventItem,
} from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';
import { TextDecoder, TextEncoder } from 'util';

/**
 * Parses an envelope
 */
export function parseEnvelope(
  env: string | Uint8Array,
  textEncoder: TextEncoder = new TextEncoder(),
  textDecoder: TextDecoder = new TextDecoder(),
): Envelope {
  let buffer = typeof env === 'string' ? textEncoder.encode(env) : env;

  function readBinary(length: number): Uint8Array {
    const bin = buffer.subarray(0, length);
    // Replace the buffer with the remaining data excluding trailing newline
    buffer = buffer.subarray(length + 1);
    return bin;
  }

  function readJson<T>(): T {
    let i = buffer.indexOf(0xa);
    // If we couldn't find a newline, we must have found the end of the buffer
    if (i < 0) {
      i = buffer.length;
    }

    return JSON.parse(textDecoder.decode(readBinary(i))) as T;
  }

  const envelopeHeader = readJson<BaseEnvelopeHeaders>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: [any, any][] = [];

  while (buffer.length) {
    const itemHeader = readJson<BaseEnvelopeItemHeaders>();
    const binaryLength = typeof itemHeader.length === 'number' ? itemHeader.length : undefined;

    items.push([itemHeader, binaryLength ? readBinary(binaryLength) : readJson()]);
  }

  return [envelopeHeader, items];
}

/** */
export function getEventOrTransaction(envelope: Envelope): [Event, Attachment[]] | undefined {
  let eventOrTransaction: Event | undefined;
  const attachments: Attachment[] = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'event' || type === 'transaction') {
      eventOrTransaction = Array.isArray(item) ? (item as EventItem)[1] : undefined;
    } else if (type === 'attachment') {
      const [headers, bin] = item as AttachmentItem;

      attachments.push({
        filename: headers.filename,
        attachmentType: headers.attachment_type,
        contentType: headers.content_type,
        data: bin,
      });
    }
  });

  return eventOrTransaction ? [eventOrTransaction, attachments] : undefined;
}
