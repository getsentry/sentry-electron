import { ClientClass, Dsn } from '@sentry/core';
import { getCurrentHub as getHub, Scope } from '@sentry/hub';
import {
  Breadcrumb,
  Integration,
  SentryBreadcrumbHint,
  SentryEvent,
  SentryEventHint,
  SentryResponse,
  Severity,
} from '@sentry/types';
import { CommonClient, ElectronOptions } from './common';

// tslint:disable:no-var-requires no-unsafe-any
export const getCurrentHub: typeof getHub =
  process.type === 'browser' ? module.require('@sentry/node').getCurrentHub : require('@sentry/hub').getCurrentHub;

/**
 * The Sentry Electron SDK Frontend.
 *
 * @see ElectronOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ElectronClient implements CommonClient {
  /** Actual frontend implementation for the main or renderer process. */
  private readonly inner: CommonClient;

  /**
   * Creates a new Electron SDK instance.
   *
   * This constructor automatically chooses the right implementation for the
   * process type (`browser` or `renderer`).
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    // We dynamically load the frontend implementation for the current process
    // type. In frontend bundlers such as webpack or rollup, those requires are
    // resolved statically. For this reason, we use `module.require` for the
    // main implementation here, which is only defined in the main process. The
    // renderer implementation must use the default `require`.

    // In case `process.type` is not defined, dispatch defaults to the renderer
    // implementation, which should be fine for most cases. False positives of
    // this would be running `@sentry/electron` in a bare node process, which is
    // acceptable.
    const clientClass: ClientClass<CommonClient, ElectronOptions> =
      process.type === 'browser' ? module.require('./main').MainClient : require('./renderer').RendererClient;

    this.inner = new clientClass(options);
  }

  /**
   * @inheritDoc
   */
  public async captureMinidump(path: string, event: SentryEvent, scope: Scope): Promise<void> {
    return this.inner.captureMinidump(path, event, scope);
  }

  /**
   * @inheritDoc
   */
  public install(): boolean {
    return this.inner.install();
  }

  /**
   * @inheritDoc
   */
  public async captureException(exception: any, hint?: SentryEventHint, scope?: Scope): Promise<SentryResponse> {
    return this.inner.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureMessage(
    message: string,
    level?: Severity,
    hint?: SentryEventHint,
    scope?: Scope,
  ): Promise<SentryResponse> {
    return this.inner.captureMessage(message, level, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, hint?: SentryEventHint, scope?: Scope): Promise<SentryResponse> {
    return this.inner.captureEvent(event, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: SentryBreadcrumbHint, scope?: Scope | undefined): void {
    this.inner.addBreadcrumb(breadcrumb, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public getDsn(): Dsn | undefined {
    return this.inner.getDsn();
  }

  /**
   * @inheritDoc
   */
  public getOptions(): ElectronOptions {
    return this.inner.getOptions();
  }

  /**
   * @inheritDoc
   */
  public async close(timeout?: number): Promise<boolean> {
    return this.inner.close(timeout);
  }
}

/**
 * This either calls init on main with node interations or renderer
 * with browser integrations.
 * @param options Options
 */
export function specificInit(options: ElectronOptions): void {
  process.type === 'browser' ? module.require('./main').init(options) : require('./renderer').init(options);
}

/** Convenience interface used to expose Integrations */
export interface Integrations {
  [key: string]: Integration;
}
/** Return all integrations depending if running in browser or renderer. */
export function getIntegrations(): { node: Integrations; electron: Integrations } | { browser: Integrations } {
  return process.type === 'browser'
    ? { node: module.require('./main').NodeIntegrations, electron: module.require('./main').ElectronIntegrations }
    : { browser: require('./renderer').BrowserIntegrations };
}
