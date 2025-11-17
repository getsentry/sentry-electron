import {
  _INTERNAL_captureSerializedLog,
  _INTERNAL_captureSerializedMetric,
  Attachment,
  Client,
  debug,
  DynamicSamplingContext,
  Event,
  parseEnvelope,
  ScopeData,
  SerializedLog,
  SerializedMetric,
} from '@sentry/core';
import { captureEvent, getClient, getCurrentScope } from '@sentry/node';
import { app, ipcMain, protocol, WebContents, webContents } from 'electron';
import { eventFromEnvelope } from '../common/envelope.js';
import { ipcChannelUtils, IPCMode, IpcUtils, RendererStatus } from '../common/ipc.js';
import { registerProtocol } from './electron-normalize.js';
import { createRendererEventLoopBlockStatusHandler } from './integrations/renderer-anr.js';
import { rendererProfileFromIpc } from './integrations/renderer-profiling.js';
import { getOsDeviceLogAttributes } from './log.js';
import { mergeEvents } from './merge.js';
import { normalizeReplayEnvelope } from './normalize.js';
import { ElectronMainOptionsInternal } from './sdk.js';
import { SDK_VERSION } from './version.js';

let KNOWN_RENDERERS: Set<number> | undefined;
let WINDOW_ID_TO_WEB_CONTENTS: Map<string, number> | undefined;

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
  contents: WebContents | undefined,
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

function handleAttributes(
  client: Client,
  options: ElectronMainOptionsInternal,
  contents: WebContents | undefined,
  maybeAttributes?: (typeof SerializedLog)['attributes'],
): (typeof SerializedLog)['attributes'] {
  const process = contents ? options?.getRendererName?.(contents) || 'renderer' : 'renderer';

  const attributes: Record<string, { value: string; type: 'string' }> = maybeAttributes || {};

  if (options.release) {
    attributes['sentry.release'] = { value: options.release, type: 'string' };
  }

  if (options.environment) {
    attributes['sentry.environment'] = { value: options.environment, type: 'string' };
  }

  attributes['sentry.sdk.name'] = { value: 'sentry.javascript.electron', type: 'string' };
  attributes['sentry.sdk.version'] = { value: SDK_VERSION, type: 'string' };

  attributes['electron.process'] = { value: process, type: 'string' };

  const osDeviceAttributes = getOsDeviceLogAttributes(client);

  if (osDeviceAttributes['os.name']) {
    attributes['os.name'] = { value: osDeviceAttributes['os.name'], type: 'string' };
  }
  if (osDeviceAttributes['os.version']) {
    attributes['os.version'] = { value: osDeviceAttributes['os.version'], type: 'string' };
  }
  if (osDeviceAttributes['device.brand']) {
    attributes['device.brand'] = { value: osDeviceAttributes['device.brand'], type: 'string' };
  }
  if (osDeviceAttributes['device.model']) {
    attributes['device.model'] = { value: osDeviceAttributes['device.model'], type: 'string' };
  }
  if (osDeviceAttributes['device.family']) {
    attributes['device.family'] = { value: osDeviceAttributes['device.family'], type: 'string' };
  }
}

function handleLogFromRenderer(
  client: Client,
  options: ElectronMainOptionsInternal,
  log: SerializedLog,
  contents: WebContents | undefined,
): void {
  log.attributes = handleAttributes(client, options, contents, log.attributes);
  _INTERNAL_captureSerializedLog(client, log);
}

function handleMetricFromRenderer(
  client: Client,
  options: ElectronMainOptionsInternal,
  metric: SerializedMetric,
  contents: WebContents | undefined,
): void {
  metric.attributes = handleAttributes(client, options, contents, metric.attributes);
  _INTERNAL_captureSerializedMetric(client, metric);
}

/** Enables Electron protocol handling */
function configureProtocol(client: Client, ipcUtil: IpcUtils, options: ElectronMainOptionsInternal): void {
  if (app.isReady()) {
    throw new Error("Sentry SDK should be initialized before the Electron app 'ready' event is fired");
  }

  const scheme = {
    scheme: ipcUtil.namespace,
    privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true, secure: true },
  };

  protocol.registerSchemesAsPrivileged([scheme]);

  // We Proxy this function so that later user calls to registerSchemesAsPrivileged don't overwrite our custom scheme
  // eslint-disable-next-line @typescript-eslint/unbound-method
  protocol.registerSchemesAsPrivileged = new Proxy(protocol.registerSchemesAsPrivileged, {
    apply: (target, __, args: Parameters<typeof protocol.registerSchemesAsPrivileged>) => {
      target([...args[0], scheme]);
    },
  });

  const rendererStatusChanged = createRendererEventLoopBlockStatusHandler(client);

  app
    .whenReady()
    .then(() => {
      for (const sesh of options.getSessions()) {
        registerProtocol(sesh.protocol, ipcUtil.namespace, (request) => {
          const getWebContents = (): WebContents | undefined => {
            const webContentsId = request.windowId ? WINDOW_ID_TO_WEB_CONTENTS?.get(request.windowId) : undefined;
            return webContentsId ? webContents.fromId(webContentsId) : undefined;
          };

          const data = request.body;
          if (ipcUtil.urlMatches(request.url, 'start')) {
            newProtocolRenderer();
          } else if (ipcUtil.urlMatches(request.url, 'scope') && data) {
            handleScope(options, data.toString());
          } else if (ipcUtil.urlMatches(request.url, 'envelope') && data) {
            handleEnvelope(client, options, data, getWebContents());
          } else if (ipcUtil.urlMatches(request.url, 'structured-log') && data) {
            handleLogFromRenderer(client, options, JSON.parse(data.toString()), getWebContents());
          } else if (ipcUtil.urlMatches(request.url, 'metric') && data) {
            handleMetricFromRenderer(client, options, JSON.parse(data.toString()), getWebContents());
          } else if (rendererStatusChanged && ipcUtil.urlMatches(request.url, 'status') && data) {
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
function configureClassic(client: Client, ipcUtil: IpcUtils, options: ElectronMainOptionsInternal): void {
  ipcMain.on(ipcUtil.createKey('start'), ({ sender }) => {
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
  ipcMain.on(ipcUtil.createKey('scope'), (_, jsonScope: string) => handleScope(options, jsonScope));
  ipcMain.on(ipcUtil.createKey('envelope'), ({ sender }, env: Uint8Array | string) =>
    handleEnvelope(client, options, env, sender),
  );
  ipcMain.on(ipcUtil.createKey('structured-log'), ({ sender }, log: SerializedLog) =>
    handleLogFromRenderer(client, options, log, sender),
  );
  ipcMain.on(ipcUtil.createKey('metric'), ({ sender }, metric: SerializedMetric) =>
    handleMetricFromRenderer(client, options, metric, sender),
  );

  const rendererStatusChanged = createRendererEventLoopBlockStatusHandler(client);
  if (rendererStatusChanged) {
    ipcMain.on(ipcUtil.createKey('status'), ({ sender }, status: RendererStatus) =>
      rendererStatusChanged(status, sender),
    );
  }
}

/** Sets up communication channels with the renderer */
export function configureIPC(client: Client, options: ElectronMainOptionsInternal): void {
  const ipcUtil = ipcChannelUtils(options.ipcNamespace);

  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Protocol) > 0) {
    configureProtocol(client, ipcUtil, options);
  }

  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Classic) > 0) {
    configureClassic(client, ipcUtil, options);
  }
}
