import {
  addAutoIpAddressToSession,
  debug,
  getIntegrationsToSetup,
  Integration,
  Options,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  consoleIntegration,
  contextLinesIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getCurrentScope,
  initOpenTelemetry,
  linkedErrorsIntegration,
  localVariablesIntegration,
  nativeNodeFetchIntegration,
  NodeClient,
  nodeContextIntegration,
  NodeOptions,
  onUnhandledRejectionIntegration,
  setNodeAsyncContextStrategy,
} from '@sentry/node';
import { Session, session, WebContents } from 'electron';
import { IPCMode } from '../common/ipc.js';
import { getDefaultEnvironment, getDefaultReleaseName, getSdkInfo } from './context.js';
import { additionalContextIntegration } from './integrations/additional-context.js';
import { childProcessIntegration } from './integrations/child-process.js';
import { electronBreadcrumbsIntegration } from './integrations/electron-breadcrumbs.js';
import { electronContextIntegration } from './integrations/electron-context.js';
import { gpuContextIntegration } from './integrations/gpu-context.js';
import { mainProcessSessionIntegration } from './integrations/main-process-session.js';
import { electronNetIntegration } from './integrations/net-breadcrumbs.js';
import { normalizePathsIntegration } from './integrations/normalize-paths.js';
import { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception.js';
import { preloadInjectionIntegration } from './integrations/preload-injection.js';
import { rendererEventLoopBlockIntegration } from './integrations/renderer-anr.js';
import { rendererProfilingIntegration } from './integrations/renderer-profiling.js';
import { screenshotsIntegration } from './integrations/screenshots.js';
import { sentryMinidumpIntegration } from './integrations/sentry-minidump/index.js';
import { configureIPC } from './ipc.js';
import { defaultStackParser } from './stack-parse.js';
import { ElectronOfflineTransportOptions, makeElectronOfflineTransport } from './transports/electron-offline-net.js';
import { configureUtilityProcessIPC } from './utility-processes.js';

/** Get the default integrations for the main process SDK. */
export function getDefaultIntegrations(options: ElectronMainOptions): Integration[] {
  const integrations = [
    // Electron integrations
    sentryMinidumpIntegration(), // we want this to run first as it enables the native crash handler
    electronBreadcrumbsIntegration(),
    electronNetIntegration(),
    electronContextIntegration(),
    childProcessIntegration(),
    onUncaughtExceptionIntegration(),
    preloadInjectionIntegration(),
    additionalContextIntegration(),
    screenshotsIntegration(),
    gpuContextIntegration(),
    rendererEventLoopBlockIntegration(),

    // Main process sessions
    mainProcessSessionIntegration(),

    // Node integrations
    eventFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    consoleIntegration(),
    nativeNodeFetchIntegration(),
    onUnhandledRejectionIntegration(),
    contextLinesIntegration(),
    localVariablesIntegration(),
    nodeContextIntegration({ cloudResource: false }),

    // We want paths to be normailzed after we've captured context
    normalizePathsIntegration(),
  ];

  if (options.attachScreenshot) {
    integrations.push(screenshotsIntegration());
  }

  if (options.enableRendererProfiling) {
    integrations.push(rendererProfilingIntegration());
  }

  return integrations;
}

export interface ElectronMainOptionsInternal
  extends Options<ElectronOfflineTransportOptions>,
    Omit<NodeOptions, 'transport' | 'transportOptions'> {
  /**
   * Inter-process communication mode to receive event and scope from renderers
   *
   * IPCMode.Classic - Configures Electron IPC
   * IPCMode.Protocol - Configures a custom protocol
   * IPCMode.Both - Configures both IPC and custom protocol
   *
   * defaults to IPCMode.Both for maximum compatibility
   */
  ipcMode: IPCMode;

  /**
   * Custom namespace for IPC channels and protocol routes.
   *
   * Valid characters are a-z, 0-9, hyphen (-).
   * Should match `ipcNamespace` passed in the renderer processes.
   *
   * @default "sentry-ipc"
   */
  ipcNamespace: string;

  /**
   * A function that returns an array of Electron session objects
   *
   * These sessions are used to configure communication between the Electron
   * main and renderer processes.
   *
   * Defaults to () => [session.defaultSession]
   */
  getSessions: () => Session[];

  /**
   * Callback to allow custom naming of renderer processes.
   *
   * If the callback is not set, or it returns `undefined`, the default naming
   * scheme is used.
   */
  getRendererName?: (contents: WebContents) => string | undefined;

  /**
   * Screenshots may contain PII and is an opt-in feature
   *
   * If set to true, screenshots will be captured and included with all JavaScript events.
   * Screenshots are not included for native crashes since it's not possible to capture images of crashed Electron
   * renderers.
   */
  attachScreenshot?: boolean;

  /**
   * Enables injection of 'js-profiling' document policy headers and ensure profiles are forwarded with transactions
   */
  enableRendererProfiling?: boolean;
}

// getSessions and ipcMode properties are optional because they have defaults
export type ElectronMainOptions = Pick<
  Partial<ElectronMainOptionsInternal>,
  'getSessions' | 'ipcMode' | 'ipcNamespace'
> &
  Omit<ElectronMainOptionsInternal, 'getSessions' | 'ipcMode' | 'ipcNamespace'> &
  NodeOptions;

/**
 * Initialize Sentry in the Electron main process
 */
export function init(userOptions: ElectronMainOptions): void {
  const [major = 0] = process.versions.electron.split('.').map(Number);

  if (major < 23) {
    throw new Error('Sentry Electron SDK requires Electron 23 or higher');
  }

  const optionsWithDefaults = {
    _metadata: { sdk: getSdkInfo(!!userOptions.sendDefaultPii) },
    ipcMode: IPCMode.Both,
    ipcNamespace: 'sentry-ipc',
    release: getDefaultReleaseName(),
    environment: getDefaultEnvironment(),
    defaultIntegrations: getDefaultIntegrations(userOptions),
    transport: makeElectronOfflineTransport(),
    transportOptions: {},
    getSessions: () => [session.defaultSession],
    ...userOptions,
    stackParser: stackParserFromStackParserOptions(userOptions.stackParser || defaultStackParser),
    includeServerName: false,
  };

  const options = {
    ...optionsWithDefaults,
    integrations: getIntegrationsToSetup(optionsWithDefaults),
  };

  if (options.debug) {
    debug.enable();
  }

  removeRedundantIntegrations(options);
  configureUtilityProcessIPC();

  setNodeAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new NodeClient(options);

  if (options.sendDefaultPii === true) {
    client.on('beforeSendSession', addAutoIpAddressToSession);
  }

  scope.setClient(client);
  client.init();

  configureIPC(client, options);

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (!options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client);
  }
}

/** A list of integrations which cause default integrations to be removed */
const INTEGRATION_OVERRIDES = [
  { userAdded: 'ElectronMinidump', toRemove: 'SentryMinidump' },
  { userAdded: 'BrowserWindowSession', toRemove: 'MainProcessSession' },
];

/** Sets the default integrations and ensures that multiple minidump or session integrations are not enabled */
function removeRedundantIntegrations(
  // At this point we know that the integrations are an array
  options: { integrations: Integration[] },
): void {
  for (const { userAdded, toRemove } of INTEGRATION_OVERRIDES) {
    if (options.integrations.some((i) => i.name === userAdded)) {
      options.integrations = options.integrations.filter((i) => i.name !== toRemove);
    }
  }
}
