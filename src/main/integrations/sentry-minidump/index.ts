import {
  applyScopeDataToEvent,
  captureEvent,
  convertIntegrationFnToClass,
  defineIntegration,
  Scope,
} from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, ScopeData } from '@sentry/types';
import { logger, SentryError } from '@sentry/utils';
import { app, crashReporter } from 'electron';

import { mergeEvents } from '../../../common';
import { addScopeListener, getScopeData } from '../../../common/scope';
import { getDefaultEnvironment, getDefaultReleaseName, getEventDefaults } from '../../context';
import { EXIT_REASONS, onChildProcessGone, onRendererProcessGone } from '../../electron-normalize';
import { getSentryCachePath } from '../../fs';
import { getRendererProperties, trackRendererProperties } from '../../renderers';
import { ElectronMainOptions } from '../../sdk';
import { checkPreviousSession, sessionCrashed } from '../../sessions';
import { BufferedWriteStore } from '../../store';
import { getMinidumpLoader, MinidumpLoader } from './minidump-loader';

interface PreviousRun {
  scope: ScopeData;
  event?: Event;
}

const INTEGRATION_NAME = 'SentryMinidump';

interface Options {
  /**
   * Maximum number of minidumps to send per session
   * Once this number has been reached, no more minidumps will be sent
   *
   * default: 10
   */
  maxMinidumpsPerSession?: number;
}

/**
 * Sends minidumps via the Sentry uploader
 */
export const sentryMinidumpIntegration = defineIntegration((options: Options = {}) => {
  // The remaining number of minidumps that can be sent in this session
  let minidumpsRemaining = options.maxMinidumpsPerSession || 10;
  // Store to persist context information beyond application crashes.
  let scopeStore: BufferedWriteStore<PreviousRun> | undefined;
  // We need to store the scope in a variable here so it can be attached to minidumps
  let scopeLastRun: Promise<PreviousRun> | undefined;
  let minidumpLoader: MinidumpLoader | undefined;

  function startCrashReporter(): void {
    logger.log('Starting Electron crashReporter');

    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: app.name || app.getName(),
      // Empty string doesn't work for Linux Crashpad and no submitURL doesn't work for older versions of Electron
      submitURL: 'https://f.a.k/e',
      uploadToServer: false,
      compress: true,
    });
  }

  function setupScopeListener(currentRelease: string, currentEnvironment: string): void {
    function scopeChanged(scope: ScopeData): void {
      // Since the initial scope read is async, we need to ensure that any writes do not beat that
      // https://github.com/getsentry/sentry-electron/issues/585
      setImmediate(async () =>
        scopeStore?.set({
          scope,
          event: await getEventDefaults(currentRelease, currentEnvironment),
        }),
      );
    }

    addScopeListener((scope) => {
      scopeChanged(scope);
    });

    scopeChanged(getScopeData());
  }

  async function sendNativeCrashes(client: NodeClient, eventIn: Event): Promise<boolean> {
    // Whenever we are called, assume that the crashes we are going to load down
    // below have occurred recently. This means, we can use the same event data
    // for all minidumps that we load now. There are two conditions:
    //
    //  1. The application crashed and we are just starting up. The stored
    //     breadcrumbs and context reflect the state during the application
    //     crash.
    //
    //  2. A renderer process crashed recently and we have just been notified
    //     about it. Just use the breadcrumbs and context information we have
    //     right now and hope that the delay was not too long.

    const event = eventIn;

    // If this is a native main process crash, we need to apply the scope and context from the previous run
    if (event.tags?.['event.process'] === 'browser') {
      const previousRun = await scopeLastRun;
      if (previousRun) {
        if (previousRun.scope) {
          applyScopeDataToEvent(event, previousRun.scope);
        }

        event.release = previousRun.event?.release || event.release;
        event.environment = previousRun.event?.environment || event.environment;
        event.contexts = previousRun.event?.contexts || event.contexts;
      }
    }

    if (!event) {
      return false;
    }

    if (minidumpsRemaining <= 0) {
      logger.log('Not sending minidumps because the limit has been reached');
    }

    // If the SDK is not enabled, or we've already reached the minidump limit, tell the loader to delete all minidumps
    const deleteAll = client.getOptions().enabled === false || minidumpsRemaining <= 0;

    let minidumpFound = false;
    await minidumpLoader?.(deleteAll, (attachment) => {
      minidumpFound = true;

      if (minidumpsRemaining > 0) {
        minidumpsRemaining -= 1;
        captureEvent(event as Event, { attachments: [attachment] });
      }
    });

    return minidumpFound;
  }

  async function sendRendererCrash(
    client: NodeClient,
    options: ElectronMainOptions,
    contents: Electron.WebContents,
    details: Partial<Electron.RenderProcessGoneDetails>,
  ): Promise<void> {
    const { getRendererName, release, environment } = options;
    const crashedProcess = getRendererName?.(contents) || 'renderer';

    logger.log(`'${crashedProcess}' process '${details.reason}'`);

    const event = mergeEvents(await getEventDefaults(release, environment), {
      contexts: {
        electron: {
          crashed_url: getRendererProperties(contents.id)?.url || 'unknown',
          details,
        },
      },
      level: 'fatal',
      // The default is javascript
      platform: 'native',
      tags: {
        'event.environment': 'native',
        'event.process': crashedProcess,
        'exit.reason': details.reason,
        event_type: 'native',
      },
    });

    const found = await sendNativeCrashes(client, event);

    if (found) {
      sessionCrashed();
    }
  }

  async function sendChildProcessCrash(
    client: NodeClient,
    options: ElectronMainOptions,
    details: Omit<Electron.Details, 'exitCode'>,
  ): Promise<void> {
    logger.log(`${details.type} process has ${details.reason}`);

    const { release, environment } = options;

    const event = mergeEvents(await getEventDefaults(release, environment), {
      contexts: {
        electron: { details },
      },
      level: 'fatal',
      // The default is javascript
      platform: 'native',
      tags: {
        'event.environment': 'native',
        'event.process': details.type,
        'exit.reason': details.reason,
        event_type: 'native',
      },
    });

    const found = await sendNativeCrashes(client, event);

    if (found) {
      sessionCrashed();
    }
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // noop
    },
    setup(client: NodeClient): void {
      // Mac AppStore builds cannot run the crash reporter due to the sandboxing
      // requirements. In this case, we prevent enabling native crashes entirely.
      // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
      if (process.mas) {
        return;
      }

      startCrashReporter();

      scopeStore = new BufferedWriteStore<PreviousRun>(getSentryCachePath(), 'scope_v3', {
        scope: new Scope().getScopeData(),
      });
      scopeLastRun = scopeStore.get();
      minidumpLoader = getMinidumpLoader();

      const options = client.getOptions();

      const currentRelease = options?.release || getDefaultReleaseName();
      const currentEnvironment = options?.environment || getDefaultEnvironment();

      setupScopeListener(currentRelease, currentEnvironment);

      if (!options?.dsn) {
        throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
      }

      trackRendererProperties();

      onRendererProcessGone(EXIT_REASONS, (contents, details) => sendRendererCrash(client, options, contents, details));
      onChildProcessGone(EXIT_REASONS, (details) => sendChildProcessCrash(client, options, details));

      // Start to submit recent minidump crashes. This will load breadcrumbs and
      // context information that was cached on disk in the previous app run, prior to the crash.
      sendNativeCrashes(client, {
        level: 'fatal',
        platform: 'native',
        tags: {
          'event.environment': 'native',
          'event.process': 'browser',
          event_type: 'native',
        },
      })
        .then((minidumpsFound) =>
          // Check for previous uncompleted session. If a previous session exists
          // and no minidumps were found, its likely an abnormal exit
          checkPreviousSession(minidumpsFound),
        )
        .catch((error) => logger.error(error));
    },
  };
});

/**
 * Sends minidumps via the Sentry uploader
 *
 * @deprecated Use `sentryMinidumpIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const SentryMinidump = convertIntegrationFnToClass(INTEGRATION_NAME, sentryMinidumpIntegration);
