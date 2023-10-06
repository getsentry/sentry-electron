import { captureEvent, configureScope, getCurrentHub, Scope } from '@sentry/core';
import { Attachment, AttachmentItem, Envelope, Event, EventItem } from '@sentry/types';
import { forEachEnvelopeItem, logger, parseEnvelope, SentryError } from '@sentry/utils';
import { app, ipcMain, protocol, WebContents, webContents } from 'electron';
import { TextDecoder, TextEncoder } from 'util';

import {
  IPCChannel,
  IPCMode,
  mergeEvents,
  normalizeUrlsInReplayEnvelope,
  PROTOCOL_SCHEME,
  RendererStatus,
} from '../common';
import { registerProtocol, supportsFullProtocol, whenAppReady } from './electron-normalize';
import { ElectronMainOptionsInternal } from './sdk';

let KNOWN_RENDERERS: Set<number> | undefined;
let WINDOW_ID_TO_WEB_CONTENTS: Map<string, number> | undefined;

async function newProtocolRenderer(): Promise<void> {
  KNOWN_RENDERERS = KNOWN_RENDERERS || new Set();
  WINDOW_ID_TO_WEB_CONTENTS = WINDOW_ID_TO_WEB_CONTENTS || new Map();

  for (const wc of webContents.getAllWebContents()) {
    const wcId = wc.id;
    if (KNOWN_RENDERERS.has(wcId)) {
      continue;
    }

    if (!wc.isDestroyed()) {
      try {
        const windowId: string | undefined = await wc.executeJavaScript('window.__SENTRY_RENDERER_ID__');

        if (windowId) {
          KNOWN_RENDERERS.add(wcId);
          WINDOW_ID_TO_WEB_CONTENTS.set(windowId, wcId);

          wc.once('destroyed', () => {
            KNOWN_RENDERERS?.delete(wcId);
            WINDOW_ID_TO_WEB_CONTENTS?.delete(windowId);
          });
        }
      } catch (_) {
        // ignore
      }
    }
  }
}

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
      const [headers, data] = item as AttachmentItem;

      attachments.push({
        filename: headers.filename,
        attachmentType: headers.attachment_type,
        contentType: headers.content_type,
        data,
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
    const normalizedEnvelope = normalizeUrlsInReplayEnvelope(envelope, app.getAppPath());
    // Pass other types of envelope straight to the transport
    void getCurrentHub().getClient()?.getTransport()?.send(normalizedEnvelope);
  }
}

type StatusListener = (status: RendererStatus, contents: WebContents) => void;

let statusListeners: StatusListener[] | undefined;

/**
 * Adds a listener that will be called when the renderer process sends a status update
 */
export function addStatusListener(listener: StatusListener): void {
  statusListeners = statusListeners || [];
  statusListeners.push(listener);
}

function handleRendererStatus(status: RendererStatus, contents: WebContents): void {
  statusListeners = statusListeners || [];
  for (const listener of statusListeners) {
    listener(status, contents);
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
      privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true, secure: true },
    },
  ]);

  whenAppReady
    .then(() => {
      for (const sesh of options.getSessions()) {
        registerProtocol(sesh.protocol, PROTOCOL_SCHEME, (request) => {
          const getWebContents = (): WebContents | undefined => {
            const webContentsId = request.windowId ? WINDOW_ID_TO_WEB_CONTENTS?.get(request.windowId) : undefined;
            return webContentsId ? webContents.fromId(webContentsId) : undefined;
          };

          const data = request.body;
          if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.RENDERER_START}`)) {
            void newProtocolRenderer();
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.EVENT}`) && data) {
            handleEvent(options, data.toString(), getWebContents());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}`) && data) {
            handleScope(options, data.toString());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.ENVELOPE}`) && data) {
            handleEnvelope(options, data, getWebContents());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.STATUS}`) && data) {
            const contents = getWebContents();
            if (contents) {
              const status = (JSON.parse(data.toString()) as { status: RendererStatus }).status;
              handleRendererStatus(status, contents);
            }
          }
        });
      }
    })
    .catch((error) => logger.error(error));
}

/**
 * Hooks IPC for communication with the renderer processes
 */
function configureClassic(options: ElectronMainOptionsInternal): void {
  ipcMain.on(IPCChannel.RENDERER_START, ({ sender }) => {
    const id = sender.id;

    // In older Electron, sender can be destroyed before this callback is called
    if (!sender.isDestroyed()) {
      // Keep track of renderers that are using IPC
      KNOWN_RENDERERS = KNOWN_RENDERERS || new Set();
      KNOWN_RENDERERS.add(id);

      sender.once('destroyed', () => {
        KNOWN_RENDERERS?.delete(id);
      });
    }
  });
  ipcMain.on(IPCChannel.EVENT, ({ sender }, jsonEvent: string) => handleEvent(options, jsonEvent, sender));
  ipcMain.on(IPCChannel.SCOPE, (_, jsonScope: string) => handleScope(options, jsonScope));
  ipcMain.on(IPCChannel.ENVELOPE, ({ sender }, env: Uint8Array | string) => handleEnvelope(options, env, sender));
  ipcMain.on(IPCChannel.STATUS, ({ sender }, status: RendererStatus) => handleRendererStatus(status, sender));
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
