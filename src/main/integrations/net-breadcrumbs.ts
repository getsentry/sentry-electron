/* eslint-disable deprecation/deprecation */
import { getCurrentHub } from '@sentry/core';
import { Integration, Span } from '@sentry/types';
import { fill } from '@sentry/utils';
import { ClientRequest, ClientRequestConstructorOptions, IncomingMessage, net } from 'electron';
import * as urlModule from 'url';

/** http module integration */
export class Net implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Net';

  /**
   * @inheritDoc
   */
  public name: string = Net.id;

  /**
   * @inheritDoc
   */
  private readonly _breadcrumbs: boolean;

  /**
   * @inheritDoc
   */
  private readonly _tracing: boolean;

  /**
   * @inheritDoc
   */
  public constructor(options: { breadcrumbs?: boolean; tracing?: boolean } = {}) {
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._tracing = typeof options.tracing === 'undefined' ? true : options.tracing;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // No need to instrument if we don't want to track anything
    if (!this._breadcrumbs && !this._tracing) {
      return;
    }

    fill(net, 'request', createWrappedRequestFactory(this._breadcrumbs, this._tracing));
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
function createWrappedRequestFactory(
  breadcrumbsEnabled: boolean,
  tracingEnabled: boolean,
): WrappedRequestMethodFactory {
  return function wrappedRequestMethodFactory(originalRequestMethod: RequestMethod): RequestMethod {
    return function requestMethod(this: typeof net, options: RequestOptions): ClientRequest {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const netModule = this;

      const { url, method } = parseOptions(options);
      const request = originalRequestMethod.apply(netModule, [options]) as ClientRequest;

      if (url.match(/sentry_key/) || request.getHeader('x-sentry-auth')) {
        return request;
      }

      let span: Span | undefined;

      const scope = getCurrentHub().getScope();
      if (scope && tracingEnabled) {
        const parentSpan = scope.getSpan();

        if (parentSpan) {
          span = parentSpan.startChild({
            description: `${method} ${url}`,
            op: 'request',
          });

          request.setHeader('sentry-trace', span.toTraceparent());
        }
      }

      return request
        .once('response', function (this: ClientRequest, res: IncomingMessage): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;
          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('response', method, url, req, res);
          }
          if (tracingEnabled && span) {
            if (res.statusCode) {
              span.setHttpStatus(res.statusCode);
            }
            span.finish();
          }
        })
        .once('error', function (this: ClientRequest, _error: Error): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;

          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('error', method, url, req, undefined);
          }
          if (tracingEnabled && span) {
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
