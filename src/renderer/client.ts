import { BrowserClient, ReportDialogOptions } from '@sentry/browser';
import { BaseClient, getCurrentHub, Scope } from '@sentry/core';
import { Breadcrumb, BreadcrumbHint, Event, EventHint } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';
import { ipcRenderer } from 'electron';
import { CommonClient, ElectronOptions, IPC_CRUMB } from '../common';
import { RendererBackend } from './backend';

/** Frontend implementation for Electron renderer backends. */
export class RendererClient extends BaseClient<RendererBackend, ElectronOptions> implements CommonClient {
  /**
   * Internal used browser client
   */
  private readonly _inner: BrowserClient;

  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    super(RendererBackend, options);
    this._inner = new BrowserClient(options);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): SyncPromise<Event | null> {
    event.platform = event.platform || 'javascript';
    return super._prepareEvent(event, scope, hint);
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope The SDK scope used to upload.
   */
  public captureMinidump(): string | undefined {
    // Noop
    return undefined;
  }

  /**
   * @inheritDoc
   * TODO
   */
  public async addBreadcrumb(breadcrumb: Breadcrumb, _hint?: BreadcrumbHint, _scope?: Scope): Promise<void> {
    ipcRenderer.send(IPC_CRUMB, breadcrumb);
  }

  /**
   * Basically calling {@link BrowserClient.showReportDialog}
   * @inheritdoc
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
    if (!options.eventId) {
      options.eventId = getCurrentHub().lastEventId();
    }
    this._inner.showReportDialog(options);
  }
}
