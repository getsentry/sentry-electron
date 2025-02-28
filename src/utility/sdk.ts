import {
  createStackParser,
  getIntegrationsToSetup,
  Integration,
  logger,
  nodeStackLineParser,
  StackParser,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  consoleIntegration,
  createGetModuleFromFilename,
  eventFiltersIntegration,
  functionToStringIntegration,
  getCurrentScope,
  initOpenTelemetry,
  linkedErrorsIntegration,
  nativeNodeFetchIntegration,
  NodeClient,
  NodeOptions,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  setNodeAsyncContextStrategy,
} from '@sentry/node';

import { makeUtilityProcessTransport } from './transport';

export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(createGetModuleFromFilename()));

/** Get the default integrations for the main process SDK. */
export function getDefaultIntegrations(): Integration[] {
  const integrations = [
    // Node integrations
    eventFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    consoleIntegration(),
    nativeNodeFetchIntegration(),
    onUncaughtExceptionIntegration(),
    onUnhandledRejectionIntegration(),
  ];

  return integrations;
}

/**
 * Initialize Sentry in the Electron main process
 */
export function init(userOptions: NodeOptions = {}): void {
  const optionsWithDefaults = {
    defaultIntegrations: getDefaultIntegrations(),
    transport: makeUtilityProcessTransport(),
    sendClientReports: false,
    ...userOptions,
    stackParser: stackParserFromStackParserOptions(userOptions.stackParser || defaultStackParser),
    // Events are sent via the main process but the Node SDK wont start without dsn
    dsn: 'https://12345@dummy.dsn/12345',
  };

  const options = {
    ...optionsWithDefaults,
    integrations: getIntegrationsToSetup(optionsWithDefaults),
  };

  if (options.debug) {
    logger.enable();
  }

  setNodeAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new NodeClient(options);
  scope.setClient(client);
  client.init();

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (!options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client);
  }
}
