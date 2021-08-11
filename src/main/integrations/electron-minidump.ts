import { getCurrentHub, Scope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, Integration, ScopeContext } from '@sentry/types';
import { Dsn, forget, logger, SentryError } from '@sentry/utils';
import { app, crashReporter } from 'electron';

import { mergeEvents, normalizeEvent } from '../../common';
import { getEventDefaults } from '../context';
import { rendererRequiresCrashReporterStart, usesCrashpad } from '../electron-normalize';

/** Is object defined and has keys */
function hasKeys(obj: any): boolean {
  return obj != undefined && Object.keys(obj).length > 0;
}

/** Gets a Scope object with user, tags and extra */
function getScope(): Partial<ScopeContext> {
  const scope = getCurrentHub().getScope() as any | undefined;

  if (!scope) {
    return {};
  }

  return {
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    ...(hasKeys(scope._user) && { user: scope._user }),
    ...(hasKeys(scope._tags) && { tags: scope._tags }),
    ...(hasKeys(scope._extra) && { extra: scope._extra }),
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  };
}

/**
 * Returns the minidump endpoint in Sentry
 * @param dsn Dsn
 */
export function minidumpUrlFromDsn(dsn: Dsn): string {
  const { host, path, projectId, port, protocol, user } = dsn;
  return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
    path !== '' ? `/${path}` : ''
  }/api/${projectId}/minidump/?sentry_key=${user}`;
}

/** Sends minidumps via the Electron built-in uploader. */
export class ElectronMinidump implements Integration {
  /** @inheritDoc */
  public static id: string = 'ElectronMinidump';

  /** @inheritDoc */
  public name: string = ElectronMinidump.id;

  /** Counter used to ensure no race condition when updating extra params */
  private _updateEpoch: number = 0;

  /** @inheritDoc */
  public setupOnce(): void {
    // Mac AppStore builds cannot run the crash reporter due to the sandboxing
    // requirements. In this case, we prevent enabling native crashes entirely.
    // https://electronjs.org/docs/tutorial/mac-app-store-submission-guide#limitations-of-mas-build
    if (process.mas) {
      return;
    }

    if (rendererRequiresCrashReporterStart()) {
      throw new SentryError(`The '${this.name}' integration is only supported with Electron >= v9`);
    }

    const dsnString = getCurrentHub().getClient<NodeClient>()?.getOptions()?.dsn;

    if (!dsnString) {
      throw new SentryError('Attempted to enable Electron native crash reporter but no DSN was supplied');
    }

    this._startCrashReporter(dsnString);

    // If we're using the Crashpad minidump uploader, we set extra parameters whenever the scope updates
    if (usesCrashpad()) {
      this._setupScopeListener();
    }
  }

  /**
   * Starts the native crash reporter
   */
  private _startCrashReporter(dsn: string): void {
    // We don't add globalExtra when Breakpad is in use because it doesn't support JSON like strings:
    // https://github.com/electron/electron/issues/29711
    const globalExtra = usesCrashpad() ? { sentry___initialScope: JSON.stringify(getScope()) } : undefined;

    logger.log('Starting Electron crashReporter');

    crashReporter.start({
      companyName: '',
      ignoreSystemCrashHandler: true,
      productName: app.name || app.getName(),
      submitURL: minidumpUrlFromDsn(new Dsn(dsn)),
      uploadToServer: true,
      compress: true,
      globalExtra,
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
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        (scope as any)._eventProcessors = [];
        (scope as any)._scopeListeners = [];
        /* eslint-enable @typescript-eslint/no-unsafe-member-access */

        this._updateExtraParams(scope);
      });
    }
  }

  /** Updates Electron uploader extra params */
  private _updateExtraParams(scope: Scope): void {
    this._updateEpoch += 1;
    const currentEpoch = this._updateEpoch;

    forget(
      this._getNativeUploaderEvent(scope).then((event) => {
        if (currentEpoch !== this._updateEpoch) return;

        // Update the extra parameters in the main process
        const mainParams = this._getNativeUploaderExtraParams(event);
        for (const key of Object.keys(mainParams)) {
          crashReporter.addExtraParameter(key, mainParams[key]);
        }
      }),
    );
  }

  /** Builds up an event to send with the native Electron uploader */
  private async _getNativeUploaderEvent(scope: Scope): Promise<Event> {
    const event = mergeEvents(await getEventDefaults(), {
      tags: { event_type: 'native' },
    });

    // Apply the scope to the event
    await scope.applyToEvent(event);
    // Normalise paths
    return normalizeEvent(event, app.getAppPath());
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
  private _getNativeUploaderExtraParams(event: Event): { [key: string]: string } {
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
      chunks.push(buf.slice(0, i + 1).toString());
      buf = buf.slice(i + 1);
    }

    return chunks.reduce((acc, cur, i) => {
      acc[`sentry__${i + 1}`] = cur;
      return acc;
    }, {} as { [key: string]: string });
  }
}
