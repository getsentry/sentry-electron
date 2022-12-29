import { captureEvent, configureScope, getCurrentHub, Scope } from '@sentry/core';
import { Attachment, AttachmentItem, Envelope, Event, EventItem } from '@sentry/types';
import { forEachEnvelopeItem, logger, parseEnvelope, SentryError } from '@sentry/utils';
import { app, ipcMain, protocol, WebContents } from 'electron';
import { TextDecoder, TextEncoder } from 'util';

import { IPCChannel, IPCMode, mergeEvents, PROTOCOL_SCHEME } from '../common';
import { supportsFullProtocol, whenAppReady } from './electron-normalize';
import { ElectronMainOptionsInternal } from './sdk';

function captureEventFromRenderer(
  options: ElectronMainOptionsInternal,
  event: Event,
  attachments: Attachment[],
  contents?: WebContents,
): void {
  const process = contents ? options?.getRendererName?.(contents) || 'renderer' : 'renderer';

  // Ensure breadcrumbs are empty as they sent via scope updates
  event.breadcrumbs = event.breadcrumbs || [];

  // Remove the environment as it defaults to 'production' and overwrites the main process environment
  delete event.environment;

  // Remove the SDK info as we want the Electron SDK to be the one reporting the event
  delete event.sdk?.name;
  delete event.sdk?.version;
  delete event.sdk?.packages;

  captureEvent(mergeEvents(event, { tags: { 'event.process': process } }), { attachments });
}

function handleEvent(options: ElectronMainOptionsInternal, jsonEvent: string, contents?: WebContents): void {
  let event: Event;
  try {
    event = JSON.parse(jsonEvent) as Event;
  } catch {
    logger.warn('sentry-electron received an invalid event message');
    return;
  }

  captureEventFromRenderer(options, event, [], contents);
}

function eventFromEnvelope(envelope: Envelope): [Event, Attachment[]] | undefined {
  let event: Event | undefined;
  const attachments: Attachment[] = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'event' || type === 'transaction') {
      event = Array.isArray(item) ? (item as EventItem)[1] : undefined;
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

  return event ? [event, attachments] : undefined;
}

function handleEnvelope(options: ElectronMainOptionsInternal, env: Uint8Array | string, contents?: WebContents): void {
  const envelope = parseEnvelope(env, new TextEncoder(), new TextDecoder());

  const eventAndAttachments = eventFromEnvelope(envelope);
  if (eventAndAttachments) {
    const [event, attachments] = eventAndAttachments;
    captureEventFromRenderer(options, event, attachments, contents);
  } else {
    // Pass other types of envelope straight to the transport
    void getCurrentHub().getClient()?.getTransport()?.send(envelope);
  }
}

/** Is object defined and has keys */
function hasKeys(obj: any): boolean {
  return obj != undefined && Object.keys(obj).length > 0;
}

/**
 * Handle scope updates from renderer processes
 */
function handleScope(options: ElectronMainOptionsInternal, jsonScope: string): void {
  let rendererScope: Scope;
  try {
    rendererScope = JSON.parse(jsonScope) as Scope;
  } catch {
    logger.warn('sentry-electron received an invalid scope message');
    return;
  }

  const sentScope = Scope.clone(rendererScope) as any;
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  configureScope((scope) => {
    if (hasKeys(sentScope._user)) {
      scope.setUser(sentScope._user);
    }

    if (hasKeys(sentScope._tags)) {
      scope.setTags(sentScope._tags);
    }

    if (hasKeys(sentScope._extra)) {
      scope.setExtras(sentScope._extra);
    }

    for (const attachment of sentScope._attachments || []) {
      scope.addAttachment(attachment);
    }

    const breadcrumb = sentScope._breadcrumbs.pop();
    if (breadcrumb) {
      scope.addBreadcrumb(breadcrumb, options?.maxBreadcrumbs || 100);
    }
  });
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

/** Enables Electron protocol handling */
function configureProtocol(options: ElectronMainOptionsInternal): void {
  if (app.isReady()) {
    throw new SentryError("Sentry SDK should be initialized before the Electron app 'ready' event is fired");
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_SCHEME,
      privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true },
    },
  ]);

  whenAppReady
    .then(() => {
      for (const sesh of options.getSessions()) {
        sesh.protocol.registerStringProtocol(PROTOCOL_SCHEME, (request, callback) => {
          const data = request.uploadData?.[0]?.bytes;

          if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.EVENT}`) && data) {
            handleEvent(options, data.toString());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}`) && data) {
            handleScope(options, data.toString());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.ENVELOPE}`) && data) {
            handleEnvelope(options, data);
          }

          callback('');
        });
      }
    })
    .catch((error) => logger.error(error));
}

/**
 * Hooks IPC for communication with the renderer processes
 */
function configureClassic(options: ElectronMainOptionsInternal): void {
  ipcMain.on(IPCChannel.EVENT, ({ sender }, jsonEvent: string) => handleEvent(options, jsonEvent, sender));
  ipcMain.on(IPCChannel.SCOPE, (_, jsonScope: string) => handleScope(options, jsonScope));
  ipcMain.on(IPCChannel.ENVELOPE, ({ sender }, env: Uint8Array | string) => handleEnvelope(options, env, sender));
}

/** Sets up communication channels with the renderer */
export function configureIPC(options: ElectronMainOptionsInternal): void {
  if (!supportsFullProtocol() && options.ipcMode === IPCMode.Protocol) {
    throw new SentryError('IPCMode.Protocol is only supported in Electron >= v5');
  }

  // eslint-disable-next-line no-bitwise
  if (supportsFullProtocol() && (options.ipcMode & IPCMode.Protocol) > 0) {
    configureProtocol(options);
  }

  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Classic) > 0) {
    configureClassic(options);
  }
}
