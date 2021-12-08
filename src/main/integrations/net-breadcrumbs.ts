/* eslint-disable deprecation/deprecation */
import { getCurrentHub } from '@sentry/core';
import { Integration, Span } from '@sentry/types';
import { fill } from '@sentry/utils';
import { ClientRequest, ClientRequestConstructorOptions, IncomingMessage, net } from 'electron';
import * as urlModule from 'url';

type OrBool<T> = {
  [P in keyof T]: T[P] | boolean;
};

type OrFalse<T> = {
  [P in keyof T]: T[P] | false;
};

type ShouldTraceFn = (method: string, url: string) => boolean;

interface NetOptions {
  /**
   * Whether breadcrumbs should be captured for net requests
   *
   * Defaults to: true
   */
  breadcrumbs: boolean;
  /**
   * Whether to capture transaction spans for net requests
   *
   * true | false | (method: string, url: string) => boolean
   * Defaults to: true
   */
  tracing: ShouldTraceFn;
  /**
   * Whether to add 'sentry-trace' headers to outgoing requests
   *
   * true | false | (method: string, url: string) => boolean
   * Defaults to: true
   */
  tracingOrigins: ShouldTraceFn;
}

const DEFAULT_OPTIONS: NetOptions = {
  breadcrumbs: true,
  tracing: (_method, _url) => true,
  tracingOrigins: (_method, _url) => true,
};

/** Converts all user supplied options to T | false */
export function normalizeOptions(options: Partial<OrBool<NetOptions>>): Partial<OrFalse<NetOptions>> {
  return (Object.keys(options) as (keyof NetOptions)[]).reduce((obj, k) => {
    if (typeof options[k] === 'function' || options[k] === false) {
      obj[k] = options[k] as boolean & (false | ShouldTraceFn);
    }
    return obj;
  }, {} as Partial<OrFalse<NetOptions>>);
}

/** http module integration */
export class Net implements Integration {
  /** @inheritDoc */
  public static id: string = 'Net';

  /** @inheritDoc */
  public name: string = Net.id;

  private readonly _options: OrFalse<NetOptions>;

  /** @inheritDoc */
  public constructor(options: Partial<OrBool<NetOptions>> = {}) {
    this._options = {
      ...DEFAULT_OPTIONS,
      ...normalizeOptions(options),
    };
  }

  /** @inheritDoc */
  public setupOnce(): void {
    // No need to instrument if we don't want to track anything
    if (this._options.breadcrumbs || this._options.tracing) {
      fill(net, 'request', createWrappedRequestFactory(this._options));
    }
  }
}

/**
 * Trimmed down version of the code from Electron here:
 * https://github.com/electron/electron/blob/f3df76dbdc58cb704637b89357e1400791c92cfe/lib/browser/api/net.ts#L209-L269
 *
 * We want to match the final URL that Electron uses
 */
function parseOptions(optionsIn: ClientRequestConstructorOptions | string): { method: string; url: string } {
  const { method, options } =
    typeof optionsIn === 'string'
      ? { method: 'GET', options: urlModule.parse(optionsIn) }
      : { method: (optionsIn.method || 'GET').toUpperCase(), options: optionsIn };

  let url = 'url' in options ? options.url : undefined;

  if (!url) {
    const urlObj: urlModule.UrlObject = {};
    urlObj.protocol = options.protocol || 'http:';

    if (options.host) {
      urlObj.host = options.host;
    } else {
      if (options.hostname) {
        urlObj.hostname = options.hostname;
      } else {
        urlObj.hostname = 'localhost';
      }

      if (options.port) {
        urlObj.port = options.port;
      }
    }

    const pathObj = urlModule.parse(options.path || '/');
    urlObj.pathname = pathObj.pathname;
    urlObj.search = pathObj.search;
    urlObj.hash = pathObj.hash;
    url = urlModule.format(urlObj);
  }

  return {
    method,
    url,
  };
}

type RequestOptions = string | ClientRequestConstructorOptions;
type RequestMethod = (opt: RequestOptions) => ClientRequest;
type WrappedRequestMethodFactory = (original: RequestMethod) => RequestMethod;

/** */
function createWrappedRequestFactory(options: OrFalse<NetOptions>): WrappedRequestMethodFactory {
  return function wrappedRequestMethodFactory(originalRequestMethod: RequestMethod): RequestMethod {
    return function requestMethod(this: typeof net, reqOptions: RequestOptions): ClientRequest {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const netModule = this;

      const { url, method } = parseOptions(reqOptions);
      const request = originalRequestMethod.apply(netModule, [reqOptions]) as ClientRequest;

      if (url.match(/sentry_key/) || request.getHeader('x-sentry-auth')) {
        return request;
      }

      let span: Span | undefined;

      const scope = getCurrentHub().getScope();
      if (scope && options.tracing && options.tracing(method, url)) {
        const parentSpan = scope.getSpan();

        if (parentSpan) {
          span = parentSpan.startChild({
            description: `${method} ${url}`,
            op: 'http.client',
          });

          if (options.tracingOrigins && options.tracingOrigins(method, url)) {
            request.setHeader('sentry-trace', span.toTraceparent());
          }
        }
      }

      return request
        .once('response', function (this: ClientRequest, res: IncomingMessage): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;
          if (options.breadcrumbs) {
            addRequestBreadcrumb('response', method, url, req, res);
          }
          if (span) {
            if (res.statusCode) {
              span.setHttpStatus(res.statusCode);
            }
            span.finish();
          }
        })
        .once('error', function (this: ClientRequest, _error: Error): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;

          if (options.breadcrumbs) {
            addRequestBreadcrumb('error', method, url, req, undefined);
          }
          if (span) {
            span.setHttpStatus(500);
            span.finish();
          }
        });
    };
  };
}

/**
 * Captures Breadcrumb based on provided request/response pair
 */
function addRequestBreadcrumb(
  event: string,
  method: string,
  url: string,
  req: ClientRequest,
  res?: IncomingMessage,
): void {
  getCurrentHub().addBreadcrumb(
    {
      type: 'http',
      category: 'electron.net',
      data: {
        url,
        method: method,
        status_code: res && res.statusCode,
      },
    },
    {
      event,
      request: req,
      response: res,
    },
  );
}
