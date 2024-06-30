import {
  addBreadcrumb,
  defineIntegration,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  setHttpStatus,
  spanToTraceHeader,
  startInactiveSpan,
} from '@sentry/core';
import { DynamicSamplingContext, TracePropagationTargets } from '@sentry/types';
import {
  dynamicSamplingContextToSentryBaggageHeader,
  fill,
  generateSentryTraceHeader,
  logger,
  LRUMap,
  stringMatchesSomePattern,
} from '@sentry/utils';
import { ClientRequest, ClientRequestConstructorOptions, IncomingMessage, net as electronNet } from 'electron';
import * as urlModule from 'url';

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
  const { method, options } =
    typeof optionsIn === 'string'
      ? // eslint-disable-next-line deprecation/deprecation
        { method: 'GET', options: urlModule.parse(optionsIn) }
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

    // eslint-disable-next-line deprecation/deprecation
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

function addHeadersToRequest(
  request: Electron.ClientRequest,
  url: string,
  sentryTraceHeader: string,
  dynamicSamplingContext?: Partial<DynamicSamplingContext>,
): void {
  logger.log(`[Tracing] Adding sentry-trace header ${sentryTraceHeader} to outgoing request to "${url}": `);
  request.setHeader('sentry-trace', sentryTraceHeader);

  const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
  if (sentryBaggageHeader) {
    request.setHeader('baggage', sentryBaggageHeader);
  }
}

type RequestOptions = string | ClientRequestConstructorOptions;
type RequestMethod = (opt: RequestOptions) => ClientRequest;
type WrappedRequestMethodFactory = (original: RequestMethod) => RequestMethod;

function createWrappedRequestFactory(
  options: NetOptions,
  tracePropagationTargets: TracePropagationTargets | undefined,
): WrappedRequestMethodFactory {
  // We're caching results so we don't have to recompute regexp every time we create a request.
  const createSpanUrlMap = new LRUMap<string, boolean>(100);
  const headersUrlMap = new LRUMap<string, boolean>(100);

  const shouldCreateSpan = (method: string, url: string): boolean => {
    if (options.tracing === undefined) {
      return true;
    }

    if (options.tracing === false) {
      return false;
    }

    const key = `${method}:${url}`;

    const cachedDecision = createSpanUrlMap.get(key);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = options.tracing === true || options.tracing(method, url);
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
        const { traceId, spanId, sampled, dsc } = {
          ...getIsolationScope().getPropagationContext(),
          ...getCurrentScope().getPropagationContext(),
        };

        if (span.isRecording()) {
          const sentryTraceHeader = spanToTraceHeader(span);
          const dynamicSamplingContext = dsc || getDynamicSamplingContextFromSpan(span);

          addHeadersToRequest(request, url, sentryTraceHeader, dynamicSamplingContext);
        } else {
          const sentryTraceHeader = generateSentryTraceHeader(traceId, spanId, sampled);

          const client = getClient();
          const dynamicSamplingContext =
            dsc || (client ? getDynamicSamplingContextFromClient(traceId, client) : undefined);

          addHeadersToRequest(request, url, sentryTraceHeader, dynamicSamplingContext);
        }
      }

      return request
        .once('response', function (this: ClientRequest, res: IncomingMessage): void {
          if (options.breadcrumbs !== false) {
            addRequestBreadcrumb('response', method, url, this, res);
          }

          if (res.statusCode) {
            setHttpStatus(span, res.statusCode);
          }

          span.end();
        })
        .once('error', function (this: ClientRequest, _error: Error): void {
          if (options.breadcrumbs !== false) {
            addRequestBreadcrumb('error', method, url, this, undefined);
          }

          setHttpStatus(span, 500);
          span.end();
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
  addBreadcrumb(
    {
      type: 'http',
      category: 'electron.net',
      data: {
        url,
        method: method,
        status_code: res?.statusCode,
      },
    },
    {
      event,
      request: req,
      response: res,
    },
  );
}

/**
 * Electron 'net' module integration
 */
export const electronNetIntegration = defineIntegration((options: NetOptions = {}) => {
  return {
    name: 'ElectronNet',
    setup() {
      const clientOptions = getClient()?.getOptions();

      // No need to instrument if we don't want to track anything
      if (options.breadcrumbs === false && options.tracing === false) {
        return;
      }

      fill(electronNet, 'request', createWrappedRequestFactory(options, clientOptions?.tracePropagationTargets));
    },
  };
});
