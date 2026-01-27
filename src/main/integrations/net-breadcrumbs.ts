import {
  addBreadcrumb,
  ClientOptions,
  debug,
  defineIntegration,
  fill,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getTraceData,
  LRUMap,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  setHttpStatus,
  startInactiveSpan,
  stringMatchesSomePattern,
} from '@sentry/core';
import { logger } from '@sentry/node';
import { ClientRequest, ClientRequestConstructorOptions, IncomingMessage, net as electronNet } from 'electron';
import { format as urlFormat, UrlObject } from 'url';

type ShouldTraceFn = (method: string, url: string) => boolean;

export interface NetOptions {
  /**
   * Whether breadcrumbs should be captured for net requests
   *
   * Defaults to: true
   */
  breadcrumbs?: boolean;
  /**
   * Whether to capture transaction spans for net requests
   *
   * true | false | (method: string, url: string) => boolean
   * Defaults to: true
   */
  tracing?: ShouldTraceFn | boolean;
}

/**
 * Trimmed down version of the code from Electron here:
 * https://github.com/electron/electron/blob/f3df76dbdc58cb704637b89357e1400791c92cfe/lib/browser/api/net.ts#L209-L269
 *
 * We want to match the final URL that Electron uses
 */
function parseOptions(optionsIn: ClientRequestConstructorOptions | string): { method: string; url: string } {
  if (typeof optionsIn === 'string') {
    // For full URL strings, use the WHATWG URL API directly
    try {
      return { method: 'GET', url: new URL(optionsIn).href };
    } catch {
      // If URL parsing fails, return the original string
      return { method: 'GET', url: optionsIn };
    }
  }

  const method = (optionsIn.method || 'GET').toUpperCase();
  const options = optionsIn;

  let url = 'url' in options ? options.url : undefined;

  if (!url) {
    const urlObj: UrlObject = {};
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

    // Use parseStringToURLObject for path parsing (handles relative URLs)
    const pathObj = parseStringToURLObject(options.path || '/');
    urlObj.pathname = pathObj?.pathname;
    urlObj.search = pathObj?.search;
    urlObj.hash = pathObj?.hash;
    url = urlFormat(urlObj);
  }

  return {
    method,
    url,
  };
}

type RequestOptions = string | ClientRequestConstructorOptions;
type RequestMethod = (opt: RequestOptions) => ClientRequest;
type WrappedRequestMethodFactory = (original: RequestMethod) => RequestMethod;

function createWrappedRequestFactory(
  { tracing, breadcrumbs }: NetOptions,
  { enableLogs, tracePropagationTargets, propagateTraceparent }: ClientOptions,
): WrappedRequestMethodFactory {
  // We're caching results so we don't have to recompute regexp every time we create a request.
  const createSpanUrlMap = new LRUMap<string, boolean>(100);
  const headersUrlMap = new LRUMap<string, boolean>(100);

  const shouldCreateSpan = (method: string, url: string): boolean => {
    if (tracing === undefined) {
      return true;
    }

    if (tracing === false) {
      return false;
    }

    const key = `${method}:${url}`;

    const cachedDecision = createSpanUrlMap.get(key);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = tracing === true || tracing(method, url);
    createSpanUrlMap.set(key, decision);
    return decision;
  };

  // This will be considerably simpler once `tracingOrigins` is removed in the next major release
  const shouldAttachTraceData = (method: string, url: string): boolean => {
    const key = `${method}:${url}`;

    const cachedDecision = headersUrlMap.get(key);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    if (tracePropagationTargets) {
      const decision = stringMatchesSomePattern(url, tracePropagationTargets);
      headersUrlMap.set(key, decision);
      return decision;
    }

    // We cannot reach here since either `tracePropagationTargets` or `tracingOrigins` will be defined but TypeScript
    // cannot infer that
    return true;
  };

  /**
   * Captures Breadcrumb based on provided request/response pair
   */
  const addRequestBreadcrumb = (
    event: string,
    method: string,
    url: string,
    req: ClientRequest,
    res?: IncomingMessage,
  ): void => {
    const level = getBreadcrumbLogLevelFromHttpStatusCode(res?.statusCode);

    addBreadcrumb(
      {
        type: 'http',
        category: 'electron.net',
        data: {
          url,
          method: method,
          status_code: res?.statusCode,
        },
        level,
      },
      {
        event,
        request: req,
        response: res,
      },
    );

    if (!enableLogs) {
      return;
    }

    const attributes = {
      'sentry.origin': 'auto.electron.net',
      statusCode: res?.statusCode,
    };

    switch (level) {
      case 'error':
        logger.error(logger.fmt`Electron.net request failed: ${method} ${url}`, attributes);
        break;
      case 'warning':
        logger.warn(logger.fmt`Electron.net request warning: ${method} ${url}`, attributes);
        break;
      default:
        logger.info(logger.fmt`Electron.net request succeeded: ${method} ${url}`, attributes);
    }
  };

  return function wrappedRequestMethodFactory(originalRequestMethod: RequestMethod): RequestMethod {
    return function requestMethod(this: typeof electronNet, reqOptions: RequestOptions): ClientRequest {
      const { url, method } = parseOptions(reqOptions);
      const request = originalRequestMethod.apply(this, [reqOptions]) as ClientRequest;

      if (url.match(/sentry_key/) || request.getHeader('x-sentry-auth')) {
        return request;
      }

      const span = shouldCreateSpan(method, url)
        ? startInactiveSpan({
            name: `${method} ${url}`,
            onlyIfParent: true,
            attributes: {
              url,
              type: 'net.request',
              'http.method': method,
            },
            op: 'http.client',
          })
        : new SentryNonRecordingSpan();

      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.http.electron.net');

      if (shouldAttachTraceData(method, url)) {
        for (const [key, value] of Object.entries(getTraceData({ span, propagateTraceparent }))) {
          debug.log(`[Tracing] Adding ${key} header ${value} to outgoing request to "${url}": `);
          request.setHeader(key, value);
        }
      }

      return request
        .once('response', function (this: ClientRequest, res: IncomingMessage): void {
          if (breadcrumbs !== false) {
            addRequestBreadcrumb('response', method, url, this, res);
          }

          if (res.statusCode) {
            setHttpStatus(span, res.statusCode);
          }

          span.end();
        })
        .once('error', function (this: ClientRequest, _error: Error): void {
          if (breadcrumbs !== false) {
            addRequestBreadcrumb('error', method, url, this, undefined);
          }

          setHttpStatus(span, 500);
          span.end();
        });
    };
  };
}

/**
 * Electron 'net' module integration
 */
export const electronNetIntegration = defineIntegration((options: NetOptions = {}) => {
  return {
    name: 'ElectronNet',
    setup(client) {
      // No need to instrument if we don't want to track anything
      if (options.breadcrumbs === false && options.tracing === false) {
        return;
      }

      fill(electronNet, 'request', createWrappedRequestFactory(options, client.getOptions()));
    },
  };
});
