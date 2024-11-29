import { forEachEnvelopeItem } from '@sentry/core';
import { Attachment, AttachmentItem, Envelope, Event, EventItem, Profile } from '@sentry/types';

/** Pulls an event and additional envelope items out of an envelope. Returns undefined if there was no event */
export function eventFromEnvelope(envelope: Envelope): [Event, Attachment[], Profile | undefined] | undefined {
  let event: Event | undefined;
  const attachments: Attachment[] = [];
  let profile: Profile | undefined;

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'event' || type === 'transaction' || type === 'feedback') {
      event = Array.isArray(item) ? (item as EventItem)[1] : undefined;
    } else if (type === 'attachment') {
      const [headers, data] = item as AttachmentItem;

      attachments.push({
        filename: headers.filename,
        attachmentType: headers.attachment_type,
        contentType: headers.content_type,
        data,
      });
    } else if (type === 'profile') {
      profile = item[1] as unknown as Profile;
    }
  });

  return event ? [event, attachments, profile] : undefined;
}
