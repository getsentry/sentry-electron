import { ClientClass, Scope } from '@sentry/core';
import { Dsn, Event, EventHint, Integration, IntegrationClass, Severity } from '@sentry/types';
import { dynamicRequire } from '@sentry/utils';
import { CommonClient, ElectronOptions } from './common';

/**
 * The Sentry Electron SDK Frontend.
 *
 * @see ElectronOptions for documentation on configuration options.
 */
export class ElectronClient implements CommonClient {
  /** Actual frontend implementation for the main or renderer process. */
  private readonly _inner: CommonClient;

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
    // resolved statically. For this reason, we use `dynamicRequire` for the
    // main implementation here, which is only defined in the main process. The
    // renderer implementation must use the default `require`.

    // In case `process.type` is not defined, dispatch defaults to the renderer
    // implementation, which should be fine for most cases. False positives of
    // this would be running `@sentry/electron` in a bare node process, which is
    // acceptable.
    // tslint:disable:no-unsafe-any
    const clientClass: ClientClass<CommonClient, ElectronOptions> =
      process.type === 'browser' ? dynamicRequire(module, './main').MainClient : require('./renderer').RendererClient;
    // tslint:enable:no-unsafe-any
    this._inner = new clientClass(options);
  }

  /**
   * @inheritDoc
   */
  public captureMinidump(path: string, event: Event, scope: Scope): string | undefined {
    return this._inner.captureMinidump(path, event, scope);
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined {
    return this._inner.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public captureMessage(message: string, level?: Severity, hint?: EventHint, scope?: Scope): string | undefined {
    return this._inner.captureMessage(message, level, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    console.log(event, hint, scope);
    return undefined;
    // return this._inner.captureEvent(event, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public getDsn(): Dsn | undefined {
    return this._inner.getDsn();
  }

  /**
   * @inheritDoc
   */
  public getOptions(): ElectronOptions {
    return this._inner.getOptions();
  }

  /**
   * @inheritDoc
   */
  public async close(timeout?: number): Promise<boolean> {
    return this._inner.close(timeout);
  }

  /**
   * @inheritDoc
   */
  public async flush(timeout?: number): Promise<boolean> {
    return this._inner.flush(timeout);
  }

  /**
   * @inheritDoc
   */
  public showReportDialog(options: any): void {
    // tslint:disable-next-line
    this._inner.showReportDialog(options);
  }

  /**
   * @inheritDoc
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    return this._inner.getIntegration(integration);
  }
}

/**
 * This either calls init on main with node interations or renderer
 * with browser integrations.
 *
 * @param options Options
 */
export function specificInit(options: ElectronOptions): void {
  // tslint:disable-next-line
  process.type === 'browser' ? dynamicRequire(module, './main').init(options) : require('./renderer').init(options);
}

/** Convenience interface used to expose Integrations */
export interface Integrations {
  [key: string]: Integration;
}
/** Return all integrations depending if running in browser or renderer. */
export function getIntegrations(): { node: Integrations; electron: Integrations } | { browser: Integrations } {
  // tslint:disable:no-unsafe-any
  return process.type === 'browser'
    ? {
        electron: dynamicRequire(module, './main').ElectronIntegrations,
        node: dynamicRequire(module, './main').NodeIntegrations,
      }
    : { browser: require('./renderer').BrowserIntegrations };
  // tslint:enable:no-unsafe-any
}
