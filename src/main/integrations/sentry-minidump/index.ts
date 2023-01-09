import { captureEvent, getCurrentHub, Scope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, Integration } from '@sentry/types';
import { basename, logger, SentryError } from '@sentry/utils';
import { app, crashReporter } from 'electron';

import { mergeEvents } from '../../../common';
import { getEventDefaults } from '../../context';
import { EXIT_REASONS, onChildProcessGone, onRendererProcessGone } from '../../electron-normalize';
import { sentryCachePath } from '../../fs';
import { getRendererProperties, trackRendererProperties } from '../../renderers';
import { ElectronMainOptions } from '../../sdk';
import { checkPreviousSession, sessionCrashed } from '../../sessions';
import { BufferedWriteStore } from '../../store';
import { deleteMinidump, getMinidumpLoader, MinidumpLoader } from './minidump-loader';

/** Sends minidumps via the Sentry uploader */
export class SentryMinidump implements Integration {
  /** @inheritDoc */
  public static id: string = 'SentryMinidump';

  /** @inheritDoc */
  public name: string = SentryMinidump.id;

  /** Store to persist context information beyond application crashes. */
  private _scopeStore?: BufferedWriteStore<Scope>;

  /** Temp store for the scope of last run */
  private _scopeLastRun?: Promise<Scope>;

  private _minidumpLoader?: MinidumpLoader;

  /** @inheritDoc */
  public setupOnce(): void {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return;
    }

    this._startCrashReporter();

    this._scopeStore = new BufferedWriteStore<Scope>(sentryCachePath, 'scope_v2', new Scope());
    // We need to store the scope in a variable here so it can be attached to minidumps
    this._scopeLastRun = this._scopeStore.get();

    this._setupScopeListener();

    const client = getCurrentHub().getClient<NodeClient>();
    const options = client?.getOptions() as ElectronMainOptions;

    if (!options?.dsn) {
      throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
    }

    trackRendererProperties();

    this._minidumpLoader = getMinidumpLoader();

    onRendererProcessGone(EXIT_REASONS, (contents, details) => this._sendRendererCrash(options, contents, details));
    onChildProcessGone(EXIT_REASONS, (details) => this._sendChildProcessCrash(options, details));

    // Start to submit recent minidump crashes. This will load breadcrumbs and
    // context information that was cached on disk prior to the crash.
    this._sendNativeCrashes({
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
  }

  /** Starts the native crash reporter */
  private _startCrashReporter(): void {
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

  /**
   * Helper function for sending renderer crashes
   */
  private async _sendRendererCrash(
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

    const found = await this._sendNativeCrashes(event);

    if (found) {
      sessionCrashed();
    }
  }

  /**
   * Helper function for sending child process crashes
   */
  private async _sendChildProcessCrash(
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

    const found = await this._sendNativeCrashes(event);

    if (found) {
      sessionCrashed();
    }
  }

  /**
   * Adds a scope listener to persist changes to disk.
   */
  private _setupScopeListener(): void {
    const hubScope = getCurrentHub().getScope();
    if (hubScope) {
      hubScope.addScopeListener((updatedScope) => {
        const scope = Scope.clone(updatedScope);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (scope as any)._eventProcessors = [];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (scope as any)._scopeListeners = [];

        // Since the initial scope read is async, we need to ensure that any writes do not beat that
        // https://github.com/getsentry/sentry-electron/issues/585
        setImmediate(() => {
          void this._scopeStore?.set(scope);
        });
      });
    }
  }

  /**
   * Loads new native crashes from disk and sends them to Sentry.
   *
   * Returns true if one or more minidumps were found
   */
  private async _sendNativeCrashes(event: Event): Promise<boolean> {
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

    if (this._minidumpLoader === undefined) {
      throw new SentryError('Invariant violation: Native crashes not enabled');
    }

    try {
      const minidumps = await this._minidumpLoader();

      if (minidumps.length > 0) {
        const hub = getCurrentHub();
        const client = hub.getClient();

        if (!client) {
          return true;
        }

        const enabled = client.getOptions().enabled;

        // If the SDK is not enabled, we delete the minidump files so they
        // dont accumulate and/or get sent later
        if (enabled === false) {
          minidumps.forEach(deleteMinidump);
          return false;
        }

        const storedScope = Scope.clone(await this._scopeLastRun);
        let newEvent = await storedScope.applyToEvent(event);

        const hubScope = hub.getScope();
        newEvent = hubScope ? await hubScope.applyToEvent(event) : event;

        if (!newEvent) {
          return false;
        }

        for (const minidump of minidumps) {
          const data = await minidump.load();

          if (data) {
            captureEvent(newEvent, {
              attachments: [
                {
                  attachmentType: 'event.minidump',
                  filename: basename(minidump.path),
                  data,
                },
              ],
            });
          }

          void deleteMinidump(minidump);
        }

        // Unset to recover memory
        this._scopeLastRun = undefined;
        return true;
      }
    } catch (_oO) {
      logger.error('Error while sending native crash.');
    }

    return false;
  }
}
