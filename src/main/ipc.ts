// oxlint-disable max-lines
import { EventEmitter } from 'node:events';
import type {
  Attachment,
  Client,
  DynamicSamplingContext,
  Envelope,
  Event,
  ScopeData,
  SerializedStreamedSpan,
  TransportMakeRequestResponse,
} from '@sentry/core';
import {
  _INTERNAL_captureSerializedLog,
  _INTERNAL_captureSerializedMetric,
  debug,
  forEachEnvelopeItem,
  parseEnvelope,
  uuid4,
  type SerializedLog,
  type SerializedMetric,
} from '@sentry/core';
import { captureEvent, getClient, getCurrentScope } from '@sentry/node';
import type { WebContents } from 'electron';
import { app, ipcMain, protocol, webContents } from 'electron';
import {
  eventFromEnvelope,
  isFeedbackEvent,
  profileChunkFromEnvelope,
  spanContainerFromEnvelope,
} from '../common/envelope.js';
import type { IpcUtils, RendererStatus } from '../common/ipc.js';
import { envelopeDeliveryStatus, ipcChannelUtils, IPCMode, NOT_DELIVERED } from '../common/ipc.js';
import { registerProtocol } from './electron-normalize.js';
import { createRendererEventLoopBlockStatusHandler } from './integrations/renderer-anr.js';
import { rendererProfileFromIpc } from './integrations/renderer-profiling.js';
import { getOsDeviceLogAttributes } from './log.js';
import { mergeEvents } from './merge.js';
import { normalizeProfileChunkEnvelope, normalizeReplayEnvelope, normalizeSpanStreamingEnvelope } from './normalize.js';
import type { ElectronMainOptionsInternal } from './sdk.js';
import { SDK_VERSION } from './version.js';

interface IpcMainEvents {
  'pageload-transaction': [event: Event, contents: WebContents | undefined];
  'pageload-spans': [spans: SerializedStreamedSpan[], contents: WebContents | undefined];
}

export const ipcMainHooks = new EventEmitter<IpcMainEvents>();

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

/** Safety net if a feedback send is accepted but `afterSendEvent` never fires. Longer than `sendFeedback`'s 30s. */
const RENDERER_ENVELOPE_SEND_TIMEOUT_MS = 60_000;

const feedbackDropWaiters = new Set<() => void>();
const dropHookInstalled = new WeakSet<Client>();

/** Drops that happen before the envelope is handed to the transport. These never emit `afterSendEvent`. */
const PRE_SEND_DROP_REASONS = new Set([
  'before_send',
  'event_processor',
  'sample_rate',
  'queue_overflow',
  'buffer_overflow',
  'ignored',
  'invalid',
]);

/**
 * Resolve a feedback delivery immediately when main drops it.
 *
 * `afterSendEvent` never fires for a dropped event (`beforeSend` null, an event
 * processor returning null, sample rate). Waiting on that hook would hold the
 * renderer transport until the safety timeout. A drop is recorded synchronously
 * with the category of the event, so a lone in-flight feedback can be attributed.
 */
function watchFeedbackDrop(client: Client, onDrop: () => void): () => void {
  if (!dropHookInstalled.has(client)) {
    dropHookInstalled.add(client);
    const original = client.recordDroppedEvent.bind(client);
    client.recordDroppedEvent = (reason, category, count = 1) => {
      original(reason, category, count);
      if (category !== 'feedback' || feedbackDropWaiters.size !== 1) {
        return;
      }
      if (!PRE_SEND_DROP_REASONS.has(reason)) {
        return;
      }
      for (const waiter of [...feedbackDropWaiters]) {
        waiter();
      }
    };
  }

  feedbackDropWaiters.add(onDrop);
  return () => {
    feedbackDropWaiters.delete(onDrop);
  };
}

/**
 * Main has the envelope and will send it. This is not an ingest receipt.
 *
 * Used for every renderer envelope except feedback. `sendFeedback` is the only
 * caller that treats 2xx as "Sentry received this".
 */
function acceptedByMain(client: Client): TransportMakeRequestResponse {
  if (client.getOptions().enabled === false || !client.getTransport()) {
    return NOT_DELIVERED;
  }
  return { statusCode: 200 };
}

/**
 * Capture a renderer feedback event and wait for the main client's ingest status.
 *
 * `sendFeedback` treats a 2xx from the renderer transport as delivered. This must
 * be the status Sentry returned, not a handoff acknowledgement. A missing status
 * (offline queue, disabled client) becomes 0 so that promise rejects.
 */
function deliverRendererEvent(
  client: Client,
  options: ElectronMainOptionsInternal,
  event: Event,
  dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined,
  attachments: Attachment[],
  contents: WebContents | undefined,
): Promise<TransportMakeRequestResponse> {
  if (client.getOptions().enabled === false) {
    debug.log('Not sending renderer envelope because the SDK is disabled');
    return Promise.resolve(NOT_DELIVERED);
  }

  // Keep a stable id so a concurrent event cannot satisfy this wait.
  const eventId = event.event_id || (event.event_id = uuid4());

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribeDrop = (): void => undefined;

    const timeout = setTimeout(() => {
      debug.warn('Timed out waiting for a renderer envelope to be sent to Sentry');
      finish(NOT_DELIVERED);
    }, RENDERER_ENVELOPE_SEND_TIMEOUT_MS);

    const unsubscribe = client.on('afterSendEvent', (sentEvent, response) => {
      if (sentEvent.event_id !== eventId) {
        return;
      }

      const status = envelopeDeliveryStatus(response);
      if ((status.statusCode ?? 0) < 200 || (status.statusCode ?? 0) >= 300) {
        debug.warn(
          `Renderer envelope was not delivered to Sentry (status ${status.statusCode}). A queued or dropped envelope is not a successful send.`,
        );
      }
      finish(status);
    });

    const unsubscribeBeforeSend = client.on('beforeSendEvent', (sentEvent) => {
      if (sentEvent.event_id !== eventId) {
        return;
      }
      // The event is in the transport. A later drop belongs to a different capture.
      unsubscribeDrop();
    });

    function finish(response: TransportMakeRequestResponse): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      unsubscribeBeforeSend();
      unsubscribeDrop();
      resolve(response);
    }

    unsubscribeDrop = watchFeedbackDrop(client, () => {
      debug.log('Renderer feedback was dropped before send');
      finish(NOT_DELIVERED);
    });

    try {
      captureEventFromRenderer(options, event, dynamicSamplingContext, attachments, contents);
    } catch (error) {
      debug.error('Failed to capture renderer envelope:', error);
      finish(NOT_DELIVERED);
    }
  });
}

/**
 * Queue an envelope on the main transport and return without waiting for ingest.
 *
 * Spans, replays and profiles are high-volume. The renderer only needs to know
 * that main has the bytes. `beforeEnvelope` hooks are not run again here.
 */
function forwardEnvelope(client: Client, envelope: Envelope): TransportMakeRequestResponse {
  const transport = client.getTransport();
  if (client.getOptions().enabled === false || !transport) {
    debug.log('Not sending renderer envelope because the SDK is disabled');
    return NOT_DELIVERED;
  }

  void Promise.resolve(transport.send(envelope)).catch((error: unknown) => {
    debug.error('Failed to send renderer envelope to Sentry:', error);
  });
  return acceptedByMain(client);
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

// While buffering is active, streamed span envelopes from renderers are held here so the startup
// tracing integration can merge pageload spans that arrive over multiple envelopes. See
// handleEnvelope for details.
let bufferedSpanEnvelopes: Envelope[] | undefined;

/**
 * Starts buffering streamed span envelopes from renderers
 */
export function startSpanEnvelopeBuffering(): void {
  bufferedSpanEnvelopes = bufferedSpanEnvelopes || [];
}

/**
 * Stops buffering and empties the streamed span envelope buffer.
 *
 * Spans matching `extractTraceId` are removed from their envelopes and returned so they can be
 * merged into the startup trace. Envelopes that still contain spans after extraction are forwarded
 * to the transport.
 */
export function flushSpanEnvelopeBuffer(extractTraceId?: string): SerializedStreamedSpan[] {
  const extracted: SerializedStreamedSpan[] = [];
  const buffered = bufferedSpanEnvelopes || [];
  bufferedSpanEnvelopes = undefined;

  for (const envelope of buffered) {
    const container = spanContainerFromEnvelope(envelope);

    if (!container) {
      continue;
    }

    if (extractTraceId) {
      extracted.push(...container.items.filter((span) => span.trace_id === extractTraceId));
      container.items = container.items.filter((span) => span.trace_id !== extractTraceId);
    }

    if (container.items.length > 0) {
      // Keep the envelope item header in sync with the number of remaining spans
      forEachEnvelopeItem(envelope, (item, type) => {
        if (type === 'span') {
          (item[0] as { item_count?: number }).item_count = container.items.length;
        }
      });

      void getClient()?.getTransport()?.send(envelope);
    }
  }

  return extracted;
}

async function handleEnvelope(
  client: Client,
  options: ElectronMainOptionsInternal,
  env: Uint8Array | string,
  contents?: WebContents,
): Promise<TransportMakeRequestResponse> {
  let envelope: Envelope;
  try {
    envelope = parseEnvelope(env);
  } catch (error) {
    debug.warn('sentry-electron received an invalid envelope', error);
    return NOT_DELIVERED;
  }

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

    if (
      ipcMainHooks.listenerCount('pageload-transaction') > 0 &&
      event.type === 'transaction' &&
      event.contexts?.trace?.origin === 'auto.pageload.browser'
    ) {
      // Main owns this envelope and merges it into the startup trace. Not a feedback path.
      ipcMainHooks.emit('pageload-transaction', event, contents);
      return acceptedByMain(client);
    }

    if (isFeedbackEvent(event)) {
      return deliverRendererEvent(client, options, event, dynamicSamplingContext, attachments, contents);
    }

    // Errors and transactions do not use sendFeedback. Queue them and return
    // once main has the envelope so the renderer transport is not blocked on ingest.
    try {
      captureEventFromRenderer(options, event, dynamicSamplingContext, attachments, contents);
    } catch (error) {
      debug.error('Failed to capture renderer envelope:', error);
      return NOT_DELIVERED;
    }
    return acceptedByMain(client);
  }

  // Check if this is a profile_chunk envelope (from UI profiling)
  const profileChunk = profileChunkFromEnvelope(envelope);
  if (profileChunk) {
    const normalizedEnvelope = normalizeProfileChunkEnvelope(options, envelope, app.getAppPath());
    return forwardEnvelope(client, normalizedEnvelope);
  }

  const spans = spanContainerFromEnvelope(envelope);
  if (spans) {
    const [normalizedSpanEnvelope, segmentOrigin] = normalizeSpanStreamingEnvelope(options, envelope, app.getAppPath());

    // While the startup tracing integration is waiting for a renderer pageload, the pageload
    // span tree can arrive over multiple envelopes because the renderer SDK flushes on an
    // interval. The pageload segment span gets re-created in the startup trace, so pageload
    // spans sent directly from earlier envelopes would reference a segment that is never sent.
    // We buffer streamed span envelopes until the pageload segment arrives and then hand all
    // spans from its trace to the integration so they can be merged into the startup span.
    // Buffered spans from other traces are forwarded unmodified once the wait ends.
    if (bufferedSpanEnvelopes) {
      bufferedSpanEnvelopes.push(normalizedSpanEnvelope);

      if (segmentOrigin === 'auto.pageload.browser' && ipcMainHooks.listenerCount('pageload-spans') > 0) {
        const pageloadTraceId = spanContainerFromEnvelope(normalizedSpanEnvelope)?.items.find(
          (span) => span.is_segment,
        )?.trace_id;

        ipcMainHooks.emit('pageload-spans', flushSpanEnvelopeBuffer(pageloadTraceId), contents);
      }

      // Main has the envelope and will forward it when the buffer flushes. Not a feedback path.
      return acceptedByMain(client);
    }

    return forwardEnvelope(client, normalizedSpanEnvelope);
  }

  const normalizedEnvelope = normalizeReplayEnvelope(options, envelope, app.getAppPath());
  // Pass other types of envelope straight to the transport
  return forwardEnvelope(client, normalizedEnvelope);
}

/** Is object defined and has keys */
function hasKeys(obj: unknown): boolean {
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

  const breadcrumb = (sentScope.breadcrumbs || []).pop();
  if (breadcrumb) {
    scope.addBreadcrumb(breadcrumb, options?.maxBreadcrumbs || 100);
  }
}

function handleAttributes(
  client: Client,
  options: ElectronMainOptionsInternal,
  contents: WebContents | undefined,
  maybeAttributes?: SerializedLog['attributes'],
): SerializedLog['attributes'] {
  const process = contents ? options?.getRendererName?.(contents) || 'renderer' : 'renderer';

  const attributes: SerializedLog['attributes'] = maybeAttributes || {};

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

  return attributes;
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
  // eslint-disable-next-line typescript/unbound-method
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
        registerProtocol(sesh.protocol, ipcUtil.namespace, async (request) => {
          const getWebContents = (): WebContents | undefined => {
            const webContentsId = request.windowId ? WINDOW_ID_TO_WEB_CONTENTS?.get(request.windowId) : undefined;
            return webContentsId ? webContents.fromId(webContentsId) : undefined;
          };

          const data = request.body;
          if (ipcUtil.urlMatches(request.url, 'start')) {
            newProtocolRenderer();
          } else if (ipcUtil.urlMatches(request.url, 'scope') && data) {
            handleScope(options, data.toString());
          } else if (ipcUtil.urlMatches(request.url, 'envelope')) {
            if (!data || data.length === 0) {
              return NOT_DELIVERED;
            }

            // The protocol response is this status. The renderer fetch does not
            // resolve until handoff and ingest have both finished.
            return handleEnvelope(client, options, data, getWebContents());
          } else if (ipcUtil.urlMatches(request.url, 'structured-log') && data) {
            let log: SerializedLog;
            try {
              log = JSON.parse(data.toString());
            } catch {
              debug.warn('sentry-electron received an invalid structured-log message');
              return;
            }
            handleLogFromRenderer(client, options, log, getWebContents());
          } else if (ipcUtil.urlMatches(request.url, 'metric') && data) {
            let metric: SerializedMetric;
            try {
              metric = JSON.parse(data.toString());
            } catch {
              debug.warn('sentry-electron received an invalid metric message');
              return;
            }
            handleMetricFromRenderer(client, options, metric, getWebContents());
          } else if (rendererStatusChanged && ipcUtil.urlMatches(request.url, 'status') && data) {
            const contents = getWebContents();
            if (contents) {
              let status: RendererStatus;
              try {
                status = (JSON.parse(data.toString()) as { status: RendererStatus }).status;
              } catch {
                debug.warn('sentry-electron received an invalid status message');
                return;
              }
              rendererStatusChanged(status, contents);
            }
          }

          return;
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
  // `send` has no reply. Kept so a preload that has not switched to `invoke` still delivers
  // envelopes. Those callers cannot see ingest status.
  ipcMain.on(ipcUtil.createKey('envelope'), ({ sender }, env: Uint8Array | string) => {
    void handleEnvelope(client, options, env, sender);
  });
  ipcMain.handle(ipcUtil.createKey('envelope'), async ({ sender }, env: Uint8Array | string) => {
    try {
      return await handleEnvelope(client, options, env, sender);
    } catch (error) {
      debug.error('Failed to forward renderer envelope:', error);
      return NOT_DELIVERED;
    }
  });
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
