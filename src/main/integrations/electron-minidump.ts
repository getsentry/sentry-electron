import {
  applyScopeDataToEvent,
  defineIntegration,
  Event,
  logger,
  makeDsn,
  ScopeData,
  SentryError,
  uuid4,
} from '@sentry/core';
import { NodeClient, NodeOptions } from '@sentry/node';
import { app, crashReporter } from 'electron';

import { addScopeListener, getScopeData } from '../../common/scope';
import { getEventDefaults, getSdkInfo } from '../context';
import { CRASH_REASONS, usesCrashpad } from '../electron-normalize';
import { mergeEvents } from '../merge';
import { normalizePaths } from '../normalize';
import { checkPreviousSession, sessionCrashed, unreportedDuringLastSession } from '../sessions';

/** Is object defined and has keys */
function hasKeys(obj: object | undefined): boolean {
  return obj !== undefined && Object.keys(obj).length > 0;
}

/** Gets a Scope object with user, tags and extra */
function getScope(options: NodeOptions): Event {
  const scope = getScopeData();

  if (!scope) {
    return {};
  }

  return {
    release: options.release,
    environment: options.environment,
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    ...(hasKeys(scope.user) && { user: scope.user }),
    ...(hasKeys(scope.tags) && { tags: scope.tags }),
    ...(hasKeys(scope.extra) && { extra: scope.extra }),
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  };
}

/** Chunks up event JSON into 1 or more parameters for use with the native Electron uploader
 *
 * Returns chunks with keys and values:
 * {
 *    sentry__1: '{ json...',
 *    sentry__2: 'more json...',
 *    sentry__x: 'end json }',
 * }
 */
function getNativeUploaderExtraParams(event: Event): { [key: string]: string } {
  const maxBytes = 20300;

  /** Max chunk sizes are in bytes so we can't chunk by characters or UTF8 could bite us.
   *
   * We attempt to split by space (32) and double quote characters (34) as there are plenty in JSON
   * and they are guaranteed to not be the first byte of a multi-byte UTF8 character.
   */
  let buf = Buffer.from(JSON.stringify(event));
  const chunks = [];
  while (buf.length) {
    // Find last '"'
    let i = buf.lastIndexOf(34, maxBytes + 1);
    // Or find last ' '
    if (i < 0) i = buf.lastIndexOf(32, maxBytes + 1);
    // Or find first '"'
    if (i < 0) i = buf.indexOf(34, maxBytes);
    // Or find first ' '
    if (i < 0) i = buf.indexOf(32, maxBytes);
    // We couldn't find any space or quote chars so split at maxBytes and hope for the best 🤷‍♂️
    if (i < 0) i = maxBytes;
    chunks.push(buf.subarray(0, i + 1).toString());
    buf = buf.subarray(i + 1);
  }

  return chunks.reduce((acc, cur, i) => {
    acc[`sentry__${i + 1}`] = cur;
    return acc;
  }, {} as { [key: string]: string });
}

/**
 * Returns the minidump endpoint in Sentry
 * @param dsn Dsn
 */
export function minidumpUrlFromDsn(dsn: string): string | undefined {
  const dsnComponents = makeDsn(dsn);
  if (!dsnComponents) {
    return undefined;
  }
  const { host, path, projectId, port, protocol, publicKey } = dsnComponents;
  return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
    path !== '' ? `/${path}` : ''
  }/api/${projectId}/minidump/?sentry_key=${publicKey}`;
}

/**
 * Sends minidumps via the Electron built-in uploader.
 */
export const electronMinidumpIntegration = defineIntegration(() => {
  /** Counter used to ensure no race condition when updating extra params */
  let updateEpoch = 0;

  async function getNativeUploaderEvent(client: NodeClient, scope: ScopeData): Promise<Event> {
    const event = mergeEvents(await getEventDefaults(client), {
      sdk: getSdkInfo(),
      event_id: uuid4(),
      level: 'fatal',
      platform: 'native',
      tags: { 'event.environment': 'native' },
    });

    applyScopeDataToEvent(event, scope);

    delete event.sdkProcessingMetadata;

    // Normalise paths
    return normalizePaths(event, app.getAppPath());
  }

  function updateExtraParams(client: NodeClient, scope: ScopeData): void {
    updateEpoch += 1;
    const currentEpoch = updateEpoch;

    getNativeUploaderEvent(client, scope)
      .then((event) => {
        if (currentEpoch !== updateEpoch) {
          return;
        }

        // Update the extra parameters in the main process
        const mainParams = getNativeUploaderExtraParams(event);
        for (const [key, value] of Object.entries(mainParams)) {
          crashReporter.addExtraParameter(key, value);
        }
      })
      .catch((error) => logger.error(error));
  }

  function startCrashReporter(options: NodeOptions): void {
    const submitURL = minidumpUrlFromDsn(options.dsn || '');
    if (!submitURL) {
      logger.log('Invalid DSN. Cannot start Electron crashReporter');
      return;
    }

    // We don't add globalExtra when Breakpad is in use because it doesn't support JSON like strings:
    // https://github.com/electron/electron/issues/29711
    const globalExtra = usesCrashpad() ? { sentry___initialScope: JSON.stringify(getScope(options)) } : undefined;

    logger.log('Starting Electron crashReporter');

    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: app.name || app.getName(),
      submitURL,
      uploadToServer: true,
      compress: true,
      globalExtra,
    });
  }

  function setupScopeListener(client: NodeClient): void {
    addScopeListener((scope) => {
      updateExtraParams(client, scope);
    });
  }

  return {
    name: 'ElectronMinidump',
    setup(client: NodeClient) {
      // Mac AppStore builds cannot run the crash reporter due to the sandboxing
      // requirements. In this case, we prevent enabling native crashes entirely.
      // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
      if (process.mas) {
        return;
      }

      const clientOptions = client.getOptions();

      if (!clientOptions?.dsn) {
        throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
      }

      startCrashReporter(clientOptions);

      // If a renderer process crashes, mark any existing session as crashed
      app.on('render-process-gone', (_, __, details) => {
        if (CRASH_REASONS.includes(details.reason)) {
          sessionCrashed();
        }
      });

      // If we're using the Crashpad minidump uploader, we set extra parameters whenever the scope updates
      if (usesCrashpad()) {
        setupScopeListener(client);
      }

      // Check if last crash report was likely to have been unreported in the last session
      unreportedDuringLastSession(crashReporter.getLastCrashReport()?.date).then((crashed) => {
        // Check if a previous session was not closed
        return checkPreviousSession(crashed);
      }, logger.error);
    },
  };
});
