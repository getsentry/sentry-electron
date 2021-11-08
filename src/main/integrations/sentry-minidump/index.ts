import { addBreadcrumb, getCurrentHub, Scope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, Integration, Severity } from '@sentry/types';
import { forget, isPlainObject, isThenable, logger, SentryError } from '@sentry/utils';
import { app, crashReporter } from 'electron';
import { join } from 'path';

import { onRendererProcessGone, usesCrashpad } from '../../electron-normalize';
import { mergeEvents, normalizeUrl } from '../../../common';
import { ElectronMainOptions } from '../../sdk';
import { ElectronNetTransport } from '../../transports/electron-net';
import { BaseUploader } from './base-uploader';
import { BreakpadUploader } from './breakpad-uploader';
import { CrashpadUploader } from './crashpad-uploader';
import { Store } from '../store';
import { getEventDefaults } from '../../context';
import { checkPreviousSession, sessionCrashed } from '../main-process-session';

/** Sends minidumps via the Sentry uploader.. */
export class SentryMinidump implements Integration {
  /** @inheritDoc */
  public static id: string = 'SentryMinidump';

  /** @inheritDoc */
  public name: string = SentryMinidump.id;

  /** Store to persist context information beyond application crashes. */
  private _scopeStore?: Store<Scope>;

  /** Temp store for the scope of last run */
  private _scopeLastRun?: Scope;

  /** Uploader for minidump files. */
  private _uploader?: BaseUploader;

  /** The path to the Sentry cache directory. */
  private readonly _cachePath: string = join(app.getPath('userData'), 'sentry');

  /** @inheritDoc */
  public setupOnce(): void {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return;
    }

    this._startCrashReporter();

    this._scopeStore = new Store<Scope>(this._cachePath, 'scope_v2', new Scope());
    // We need to store the scope in a variable here so it can be attached to minidumps
    this._scopeLastRun = this._scopeStore.get();

    this._setupScopeListener();

    const client = getCurrentHub().getClient<NodeClient>();
    const options = client?.getOptions() as ElectronMainOptions;

    if (!options?.dsn) {
      throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const transport = (client as any)._getBackend().getTransport() as ElectronNetTransport;

    this._uploader = usesCrashpad()
      ? new CrashpadUploader(options, this._cachePath, transport)
      : new BreakpadUploader(options, this._cachePath, transport);

    // Every time a subprocess or renderer crashes, send a minidump right away.
    onRendererProcessGone((contents, details) => this._sendRendererCrash(options, contents, details));

    // Flush already cached minidumps from the queue.
    forget(this._uploader.flushQueue());

    // Start to submit recent minidump crashes. This will load breadcrumbs and
    // context information that was cached on disk prior to the crash.
    forget(
      this._sendNativeCrashes(options, {
        level: Severity.Fatal,
        platform: 'native',
        tags: { 'event.environment': 'native', event_type: 'native' },
      }).then((minidumpsFound) => checkPreviousSession(minidumpsFound)),
    );
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
    details?: Electron.RenderProcessGoneDetails,
  ): Promise<void> {
    const { getRendererName, release } = options;
    const crashed_process = getRendererName?.(contents) || `WebContents[${contents.id}]`;

    logger.log(`Renderer process '${crashed_process}' has crashed`);

    const electron: Record<string, any> = {
      crashed_process,
      crashed_url: normalizeUrl(contents.getURL(), app.getAppPath()),
    };

    if (details) {
      // We need to do it like this, otherwise we normalize undefined to "[undefined]" in the UI
      electron.details = details;
    }

    const event = mergeEvents(await getEventDefaults(release), {
      contexts: {
        electron,
      },
      level: Severity.Fatal,
      // The default is javascript
      platform: 'native',
      tags: { 'event.environment': 'native', event_type: 'native' },
    });

    await this._sendNativeCrashes(options, event);
    sessionCrashed();

    addBreadcrumb({
      category: 'exception',
      level: Severity.Critical,
      message: 'Renderer Crashed',
    });
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

        this._scopeStore?.set(scope);
      });
    }
  }

  /**
   * Loads new native crashes from disk and sends them to Sentry.
   *
   * Returns true if one or more minidumps were found
   */
  private async _sendNativeCrashes(options: ElectronMainOptions, event: Event): Promise<boolean> {
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

    const uploader = this._uploader;
    if (uploader === undefined) {
      throw new SentryError('Invariant violation: Native crashes not enabled');
    }

    try {
      const paths = await uploader.getNewMinidumps();
      // We only want to read the scope from disk in case there was a crash last run
      if (paths.length > 0) {
        const currentCloned = Scope.clone(getCurrentHub().getScope());
        const storedScope = Scope.clone(this._scopeLastRun);
        let newEvent = await storedScope.applyToEvent(event);

        if (newEvent) {
          newEvent = await currentCloned.applyToEvent(newEvent);

          const { beforeSend, sampleRate } = options;

          if (typeof sampleRate === 'number' && Math.random() > sampleRate) {
            logger.warn(
              `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`,
            );
            return true;
          }

          if (newEvent && beforeSend) {
            const beforeSendResult = await this._ensureBeforeSendRv(beforeSend(event));

            if (beforeSendResult === null) {
              logger.warn('`beforeSend` returned `null`, will not send event.');
              return true;
            }

            newEvent = beforeSendResult;
          }

          paths.map((path) => {
            forget(uploader.uploadMinidump({ path, event: newEvent || {} }));
          });
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

  /**
   * Verifies that return value of configured `beforeSend` is of expected type.
   *
   * Copied from @sentry/core
   */
  private _ensureBeforeSendRv(rv: PromiseLike<Event | null> | Event | null): PromiseLike<Event | null> | Event | null {
    const nullErr = '`beforeSend` method has to return `null` or a valid event.';
    if (isThenable(rv)) {
      return (rv as PromiseLike<Event | null>).then(
        (event) => {
          if (!(isPlainObject(event) || event === null)) {
            throw new SentryError(nullErr);
          }
          return event;
        },
        (e) => {
          throw new SentryError(`beforeSend rejected with ${e}`);
        },
      );
    } else if (!(isPlainObject(rv) || rv === null)) {
      throw new SentryError(nullErr);
    }
    return rv;
  }
}
