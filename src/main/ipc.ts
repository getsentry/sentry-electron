import {
  _INTERNAL_captureSerializedLog,
  Attachment,
  Client,
  debug,
  DynamicSamplingContext,
  Event,
  parseEnvelope,
  ScopeData,
  SerializedLog,
} from '@sentry/core';
import { captureEvent, getClient, getCurrentScope } from '@sentry/node';
import { app, ipcMain, protocol, WebContents, webContents } from 'electron';
import { eventFromEnvelope } from '../common/envelope';
import { IPCChannel, IPCMode, PROTOCOL_SCHEME, RendererStatus } from '../common/ipc';
import { registerProtocol } from './electron-normalize';
import { createRendererAnrStatusHandler } from './integrations/renderer-anr';
import { rendererProfileFromIpc } from './integrations/renderer-profiling';
import { mergeEvents } from './merge';
import { normalizeReplayEnvelope } from './normalize';
import { ElectronMainOptionsInternal } from './sdk';
import { SDK_VERSION } from './version';

let KNOWN_RENDERERS: Set<number> | undefined;
let WINDOW_ID_TO_WEB_CONTENTS: Map<string, number> | undefined;

const SENTRY_CUSTOM_SCHEME = {
  scheme: PROTOCOL_SCHEME,
  privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true, secure: true },
};

function newProtocolRenderer(): void {
  KNOWN_RENDERERS = KNOWN_RENDERERS || new Set();
  WINDOW_ID_TO_WEB_CONTENTS = WINDOW_ID_TO_WEB_CONTENTS || new Map();

  for (const wc of webContents.getAllWebContents()) {
    const wcId = wc.id;
    if (KNOWN_RENDERERS.has(wcId)) {
      continue;
    }

    if (!wc.isDestroyed()) {
      wc.executeJavaScript('window.__SENTRY_RENDERER_ID__').then((windowId: string | undefined) => {
        if (windowId && KNOWN_RENDERERS && WINDOW_ID_TO_WEB_CONTENTS) {
          KNOWN_RENDERERS.add(wcId);
          WINDOW_ID_TO_WEB_CONTENTS.set(windowId, wcId);

          wc.once('destroyed', () => {
            KNOWN_RENDERERS?.delete(wcId);
            WINDOW_ID_TO_WEB_CONTENTS?.delete(windowId);
          });
        }
      }, debug.error);
    }
  }
}

function captureEventFromRenderer(
  options: ElectronMainOptionsInternal,
  event: Event,
  dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined,
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

  if (dynamicSamplingContext) {
    event.sdkProcessingMetadata = { ...event.sdkProcessingMetadata, dynamicSamplingContext };
  }

  captureEvent(mergeEvents(event, { tags: { 'event.process': process } }), { attachments });
}

let cached_public_key: string | undefined;

function handleEnvelope(
  client: Client,
  options: ElectronMainOptionsInternal,
  env: Uint8Array | string,
  contents?: WebContents,
): void {
  const envelope = parseEnvelope(env);

  const [envelopeHeader] = envelope;
  const dynamicSamplingContext = envelopeHeader.trace as DynamicSamplingContext | undefined;

  if (dynamicSamplingContext) {
    if (!cached_public_key) {
      const dsn = client.getDsn();
      cached_public_key = dsn?.publicKey;
    }

    dynamicSamplingContext.release = options.release;
    dynamicSamplingContext.environment = options.environment;
    dynamicSamplingContext.public_key = cached_public_key;
  }

  const eventAndAttachments = eventFromEnvelope(envelope);
  if (eventAndAttachments) {
    const [event, attachments, profile] = eventAndAttachments;

    if (profile) {
      // We have a 'profile' item and there is no way for us to pass this through event capture
      // so store them in a cache and reattach them via the `beforeEnvelope` hook before sending
      rendererProfileFromIpc(event, profile);
    }

    captureEventFromRenderer(options, event, dynamicSamplingContext, attachments, contents);
  } else {
    const normalizedEnvelope = normalizeReplayEnvelope(options, envelope, app.getAppPath());
    // Pass other types of envelope straight to the transport
    void getClient()?.getTransport()?.send(normalizedEnvelope);
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
  let sentScope: ScopeData;
  try {
    sentScope = JSON.parse(jsonScope) as ScopeData;
  } catch {
    debug.warn('sentry-electron received an invalid scope message');
    return;
  }

  const scope = getCurrentScope();

  if (hasKeys(sentScope.user)) {
    scope.setUser(sentScope.user);
  }

  if (hasKeys(sentScope.tags)) {
    scope.setTags(sentScope.tags);
  }

  if (hasKeys(sentScope.extra)) {
    scope.setExtras(sentScope.extra);
  }

  for (const attachment of sentScope.attachments || []) {
    scope.addAttachment(attachment);
  }

  const breadcrumb = sentScope.breadcrumbs.pop();
  if (breadcrumb) {
    scope.addBreadcrumb(breadcrumb, options?.maxBreadcrumbs || 100);
  }
}

function handleLogFromRenderer(client: Client, options: ElectronMainOptionsInternal, log: SerializedLog): void {
  log.attributes = log.attributes || {};

  if (options.release) {
    log.attributes['sentry.release'] = { value: options.release, type: 'string' };
  }

  if (options.environment) {
    log.attributes['sentry.environment'] = { value: options.environment, type: 'string' };
  }

  log.attributes['sentry.sdk.name'] = { value: 'sentry.javascript.electron', type: 'string' };
  log.attributes['sentry.sdk.version'] = { value: SDK_VERSION, type: 'string' };

  _INTERNAL_captureSerializedLog(client, log);
}

/** Enables Electron protocol handling */
function configureProtocol(client: Client, options: ElectronMainOptionsInternal): void {
  if (app.isReady()) {
    throw new Error("Sentry SDK should be initialized before the Electron app 'ready' event is fired");
  }

  protocol.registerSchemesAsPrivileged([SENTRY_CUSTOM_SCHEME]);

  // We Proxy this function so that later user calls to registerSchemesAsPrivileged don't overwrite our custom scheme
  // eslint-disable-next-line @typescript-eslint/unbound-method
  protocol.registerSchemesAsPrivileged = new Proxy(protocol.registerSchemesAsPrivileged, {
    apply: (target, __, args: Parameters<typeof protocol.registerSchemesAsPrivileged>) => {
      target([...args[0], SENTRY_CUSTOM_SCHEME]);
    },
  });

  const rendererStatusChanged = createRendererAnrStatusHandler(client);

  app
    .whenReady()
    .then(() => {
      for (const sesh of options.getSessions()) {
        registerProtocol(sesh.protocol, PROTOCOL_SCHEME, (request) => {
          const getWebContents = (): WebContents | undefined => {
            const webContentsId = request.windowId ? WINDOW_ID_TO_WEB_CONTENTS?.get(request.windowId) : undefined;
            return webContentsId ? webContents.fromId(webContentsId) : undefined;
          };

          const data = request.body;
          if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.RENDERER_START}`)) {
            newProtocolRenderer();
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}`) && data) {
            handleScope(options, data.toString());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.ENVELOPE}`) && data) {
            handleEnvelope(client, options, data, getWebContents());
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.STRUCTURED_LOG}`) && data) {
            handleLogFromRenderer(client, options, JSON.parse(data.toString()));
          } else if (
            rendererStatusChanged &&
            request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.STATUS}`) &&
            data
          ) {
            const contents = getWebContents();
            if (contents) {
              const status = (JSON.parse(data.toString()) as { status: RendererStatus }).status;
              rendererStatusChanged(status, contents);
            }
          }
        });
      }
    })
    .catch((error) => debug.error(error));
}

/**
 * Hooks IPC for communication with the renderer processes
 */
function configureClassic(client: Client, options: ElectronMainOptionsInternal): void {
  ipcMain.on(IPCChannel.RENDERER_START, ({ sender }) => {
    const id = sender.id;
    // Keep track of renderers that are using IPC
    KNOWN_RENDERERS = KNOWN_RENDERERS || new Set();

    if (KNOWN_RENDERERS.has(id)) {
      return;
    }

    // In older Electron, sender can be destroyed before this callback is called
    if (!sender.isDestroyed()) {
      KNOWN_RENDERERS.add(id);

      sender.once('destroyed', () => {
        KNOWN_RENDERERS?.delete(id);
      });
    }
  });
  ipcMain.on(IPCChannel.SCOPE, (_, jsonScope: string) => handleScope(options, jsonScope));
  ipcMain.on(IPCChannel.ENVELOPE, ({ sender }, env: Uint8Array | string) =>
    handleEnvelope(client, options, env, sender),
  );
  ipcMain.on(IPCChannel.STRUCTURED_LOG, (_, log: SerializedLog) => handleLogFromRenderer(client, options, log));

  const rendererStatusChanged = createRendererAnrStatusHandler(client);
  if (rendererStatusChanged) {
    ipcMain.on(IPCChannel.STATUS, ({ sender }, status: RendererStatus) => rendererStatusChanged(status, sender));
  }
}

/** Sets up communication channels with the renderer */
export function configureIPC(client: Client, options: ElectronMainOptionsInternal): void {
  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Protocol) > 0) {
    configureProtocol(client, options);
  }

  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Classic) > 0) {
    configureClassic(client, options);
  }
}
