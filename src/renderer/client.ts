import { BrowserClient, ReportDialogOptions } from '@sentry/browser';
import { BaseClient, getCurrentHub, Scope } from '@sentry/core';
import { Breadcrumb, SentryBreadcrumbHint, SentryEvent, SentryEventHint } from '@sentry/types';
import { ipcRenderer } from 'electron';
import { CommonClient, ElectronOptions, IPC_CRUMB } from '../common';
import { RendererBackend } from './backend';

/** Frontend implementation for Electron renderer backends. */
export class RendererClient extends BaseClient<RendererBackend, ElectronOptions> implements CommonClient {
  /**
   * Internal used browser client
   */
  private readonly inner: BrowserClient;

  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    super(RendererBackend, options);
    this.inner = new BrowserClient(options);
  }

  /**
   * @inheritDoc
   */
  protected async prepareEvent(event: SentryEvent, scope?: Scope, hint?: SentryEventHint): Promise<SentryEvent | null> {
    event.platform = event.platform || 'javascript';
    return await super.prepareEvent(event, scope, hint);
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope The SDK scope used to upload.
   */
  public async captureMinidump(_path: string, _event: SentryEvent, _scope?: Scope): Promise<void> {
    // Noop
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(breadcrumb: Breadcrumb, _hint?: SentryBreadcrumbHint, _scope?: Scope): Promise<void> {
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
    this.inner.showReportDialog(options);
  }
}
