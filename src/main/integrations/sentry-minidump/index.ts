import { captureEvent, getCurrentHub, Scope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, Integration } from '@sentry/types';
import { logger, SentryError } from '@sentry/utils';
import { app, crashReporter } from 'electron';

import { mergeEvents } from '../../../common';
import { getDefaultEnvironment, getDefaultReleaseName, getEventDefaults } from '../../context';
import { EXIT_REASONS, onChildProcessGone, onRendererProcessGone } from '../../electron-normalize';
import { getSentryCachePath } from '../../fs';
import { getRendererProperties, trackRendererProperties } from '../../renderers';
import { ElectronMainOptions } from '../../sdk';
import { checkPreviousSession, sessionCrashed } from '../../sessions';
import { BufferedWriteStore } from '../../store';
import { getMinidumpLoader, MinidumpLoader } from './minidump-loader';

interface PreviousRun {
  scope: Scope;
  event?: Event;
}

/** Sends minidumps via the Sentry uploader */
export class SentryMinidump implements Integration {
  /** @inheritDoc */
  public static id: string = 'SentryMinidump';

  /** @inheritDoc */
  public readonly name: string;

  /** Store to persist context information beyond application crashes. */
  private _scopeStore?: BufferedWriteStore<PreviousRun>;

  /** Temp store for the scope of last run */
  private _scopeLastRun?: Promise<PreviousRun>;

  private _minidumpLoader?: MinidumpLoader;

  public constructor() {
    this.name = SentryMinidump.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return;
    }

    this._startCrashReporter();

    this._scopeStore = new BufferedWriteStore<PreviousRun>(getSentryCachePath(), 'scope_v3', {
      scope: new Scope(),
    });

    // We need to store the scope in a variable here so it can be attached to minidumps
    this._scopeLastRun = this._scopeStore.get();

    const hub = getCurrentHub();
    const client = hub.getClient<NodeClient>();
    const options = client?.getOptions() as ElectronMainOptions;

    const currentRelease = options?.release || getDefaultReleaseName();
    const currentEnvironment = options?.environment || getDefaultEnvironment();

    this._setupScopeListener(currentRelease, currentEnvironment);

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
  private _setupScopeListener(currentRelease: string, currentEnvironment: string): void {
    const scopeChanged = (updatedScope: Scope): void => {
      // eslint-disable-next-line deprecation/deprecation
      const scope = Scope.clone(updatedScope);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (scope as any)._eventProcessors = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (scope as any)._scopeListeners = [];

      // Since the initial scope read is async, we need to ensure that any writes do not beat that
      // https://github.com/getsentry/sentry-electron/issues/585
      setImmediate(async () => {
        const event = await getEventDefaults(currentRelease, currentEnvironment);
        void this._scopeStore?.set({
          scope,
          event,
        });
      });
    };

    const scope = getCurrentHub().getScope();

    if (scope) {
      scope.addScopeListener(scopeChanged);
      // Ensure at least one event is written to disk
      scopeChanged(scope);
    }
  }

  /**
   * Loads new native crashes from disk and sends them to Sentry.
   *
   * Returns true if one or more minidumps were found
   */
  private async _sendNativeCrashes(eventIn: Event): Promise<boolean> {
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

    const hub = getCurrentHub();
    const client = hub.getClient();

    if (!client) {
      return true;
    }

    let event: Event | null = eventIn;

    // If this is a native main process crash, we need to apply the scope and context from the previous run
    if (event.tags?.['event.process'] === 'browser') {
      const previousRun = await this._scopeLastRun;

      // eslint-disable-next-line deprecation/deprecation
      const storedScope = Scope.clone(previousRun?.scope);
      event = await storedScope.applyToEvent(event);

      if (event && previousRun) {
        event.release = previousRun.event?.release || event.release;
        event.environment = previousRun.event?.environment || event.environment;
        event.contexts = previousRun.event?.contexts || event.contexts;
      }
    }

    const hubScope = hub.getScope();
    event = hubScope && event ? await hubScope.applyToEvent(event) : event;

    if (!event) {
      return false;
    }

    // If the SDK is not enabled, tell the loader to delete all minidumps
    const deleteAll = client.getOptions().enabled === false;

    let minidumpSent = false;
    await this._minidumpLoader(deleteAll, (attachment) => {
      captureEvent(event as Event, { attachments: [attachment] });
      minidumpSent = true;
    });

    // Unset to recover memory
    this._scopeLastRun = undefined;
    return minidumpSent;
  }
}
