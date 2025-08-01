import {
  applyScopeDataToEvent,
  captureEvent,
  debug,
  defineIntegration,
  Event,
  Scope,
  ScopeData,
  Session,
} from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { app, crashReporter } from 'electron';
import { addScopeListener, getScopeData } from '../../../common/scope';
import { getEventDefaults } from '../../context';
import { EXIT_REASONS, getSentryCachePath } from '../../electron-normalize';
import { getRendererProperties, trackRendererProperties } from '../../renderers';
import { ElectronMainOptions } from '../../sdk';
import { previousSessionWasAbnormal, restorePreviousSession, setPreviousSessionAsCurrent } from '../../sessions';
import { BufferedWriteStore } from '../../store';
import { getMinidumpLoader, MinidumpLoader } from './minidump-loader';

interface PreviousRun {
  scope: ScopeData;
  event?: Event;
}

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
    debug.log('Starting Electron crashReporter');

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

  function setupScopeListener(client: NodeClient): void {
    function scopeChanged(scope: ScopeData): void {
      // Since the initial scope read is async, we need to ensure that any writes do not beat that
      // https://github.com/getsentry/sentry-electron/issues/585
      setImmediate(async () =>
        scopeStore?.set({
          scope,
          event: await getEventDefaults(client),
        }),
      );
    }

    addScopeListener((scope) => {
      scopeChanged(scope);
    });

    scopeChanged(getScopeData());
  }

  async function sendNativeCrashes(
    client: NodeClient,
    getEvent: (minidumpProcess: string | undefined) => Event | Promise<Event>,
  ): Promise<boolean> {
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

    if (minidumpsRemaining <= 0) {
      debug.log('Not sending minidumps because the limit has been reached');
    }

    // If the SDK is not enabled, or we've already reached the minidump limit, tell the loader to delete all minidumps
    const deleteAll = client.getOptions().enabled === false || minidumpsRemaining <= 0;

    let minidumpFound = false;

    await minidumpLoader?.(deleteAll, async (minidumpResult, attachment) => {
      minidumpFound = true;

      let minidumpProcess = minidumpResult.crashpadAnnotations?.process_type;

      // For backwards compatibility, we need to map 'gpu-process' to 'GPU'
      // TODO (v7): Remove this
      if (minidumpProcess === 'gpu-process') {
        minidumpProcess = 'GPU';
      }

      const event = await getEvent(minidumpProcess);

      if (minidumpResult.crashpadAnnotations) {
        // If we have crashpad annotations, we need to prepend their keys with 'crashpad.'
        // and add them to the Electron context
        const prependedAnnotations = Object.entries(minidumpResult.crashpadAnnotations).reduce(
          (acc, [key, val]) => ((acc[`crashpad.${key}`] = val), acc),
          {} as Record<string, string>,
        );

        event.contexts = {
          ...event.contexts,
          electron: {
            ...event.contexts?.electron,
            ...prependedAnnotations,
          },
        };
      }

      if (minidumpsRemaining > 0) {
        minidumpsRemaining -= 1;
        captureEvent(event, { attachments: [attachment] });
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
    const { getRendererName } = options;

    await sendNativeCrashes(client, (minidumpProcess) => {
      // We only call 'getRendererName' if this was in fact a renderer crash
      const crashedProcess =
        (minidumpProcess === 'renderer' && getRendererName ? getRendererName(contents) : minidumpProcess) || 'unknown';

      debug.log(`'${crashedProcess}' process '${details.reason}'`);

      return {
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
        },
      };
    });
  }

  async function sendChildProcessCrash(client: NodeClient, details: Omit<Electron.Details, 'exitCode'>): Promise<void> {
    debug.log(`${details.type} process has ${details.reason}`);

    await sendNativeCrashes(client, (minidumpProcess) => ({
      contexts: {
        electron: { details },
      },
      level: 'fatal',
      // The default is javascript
      platform: 'native',
      tags: {
        'event.environment': 'native',
        'event.process': minidumpProcess || details.type,
        'exit.reason': details.reason,
        event_type: 'native',
      },
    }));
  }

  return {
    name: 'SentryMinidump',
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

      try {
        minidumpLoader = getMinidumpLoader();
      } catch (error) {
        // This is rare but we've seen reports:
        // https://github.com/getsentry/sentry-electron/issues/1102
        debug.error('Failed to create minidump loader', error);
      }

      const options = client.getOptions();

      setupScopeListener(client);

      if (!options?.dsn) {
        throw new Error('Attempted to enable Electron native crash reporter but no DSN was supplied');
      }

      trackRendererProperties();

      app.on('render-process-gone', async (_, contents, details) => {
        if (EXIT_REASONS.includes(details.reason)) {
          await sendRendererCrash(client, options, contents, details);
        }
      });
      app.on('child-process-gone', async (_, details) => {
        if (EXIT_REASONS.includes(details.reason)) {
          await sendChildProcessCrash(client, details);
        }
      });

      let sessionToRestore: Session | undefined;

      // Start to submit recent minidump crashes. This will load breadcrumbs and
      // context information that was cached on disk in the previous app run, prior to the crash.
      sendNativeCrashes(client, async (minidumpProcess) => {
        const event: Event = {
          level: 'fatal',
          platform: 'native',
          tags: {
            'event.environment': 'native',
            'event.process': minidumpProcess || 'unknown',
          },
        };

        // This crash was found at startup, we need to apply the scope and context from the previous run
        const previousRun = await scopeLastRun;
        if (previousRun) {
          if (previousRun.scope) {
            applyScopeDataToEvent(event, previousRun.scope);
          }

          event.release = previousRun.event?.release;
          event.environment = previousRun.event?.environment;
          event.contexts = previousRun.event?.contexts;

          event.sdkProcessingMetadata = {
            dynamicSamplingContext: {
              trace_id: previousRun.scope.propagationContext.traceId,
              release: previousRun.event?.release,
              environment: previousRun.event?.environment,
              public_key: client.getDsn()?.publicKey,
            },
          };
        }

        sessionToRestore = await setPreviousSessionAsCurrent();

        return event;
      })
        .then(async (minidumpsFound) => {
          if (!minidumpsFound) {
            await previousSessionWasAbnormal();
          } else if (sessionToRestore) {
            restorePreviousSession(sessionToRestore);
          }
        })
        .catch((error) => debug.error(error));
    },
  };
});
