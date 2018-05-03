import { DSN, Scope } from '@sentry/core';
import { Breadcrumb, Context, SentryEvent } from '@sentry/shim';
import { CommonFrontend, ElectronOptions } from './common';

/**
 * The Sentry Electron SDK Frontend.
 *
 * @see ElectronOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ElectronFrontend implements CommonFrontend {
  /** Actual frontend implementation for the main or renderer process. */
  private readonly inner: CommonFrontend;

  /**
   * Creates a new Electron SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ElectronOptions) {
    // tslint:disable:no-var-requires no-unsafe-any
    const frontendClass =
      process.type === 'browser'
        ? require('./main').MainFrontend
        : require('./renderer').RendererFrontend;

    this.inner = new frontendClass(options);
  }

  /**
   * @inheritDoc
   */
  public async captureMinidump(
    path: string,
    event: SentryEvent,
    scope: Scope,
  ): Promise<void> {
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
  public async captureException(
    exception: any,
    scope?: Scope | undefined,
  ): Promise<void> {
    return this.inner.captureException(exception, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureMessage(
    message: string,
    scope?: Scope | undefined,
  ): Promise<void> {
    return this.inner.captureMessage(message, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(
    event: SentryEvent,
    scope?: Scope | undefined,
  ): Promise<void> {
    return this.inner.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(
    breadcrumb: Breadcrumb,
    scope?: Scope | undefined,
  ): void {
    this.inner.addBreadcrumb(breadcrumb, scope);
  }

  /**
   * @inheritDoc
   */
  public getDSN(): DSN | undefined {
    return this.inner.getDSN();
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
  public setContext(context: Context, scope: Scope): void {
    this.inner.setContext(context, scope);
  }

  /**
   * @inheritDoc
   */
  public getInitialScope(): Scope {
    return this.inner.getInitialScope();
  }
}
