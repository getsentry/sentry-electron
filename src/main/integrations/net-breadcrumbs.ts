/* eslint-disable deprecation/deprecation */
import { getDynamicSamplingContextFromClient } from '@sentry/core';
import { getCurrentHub } from '@sentry/node';
import { DynamicSamplingContext, EventProcessor, Hub, Integration, Span, TracePropagationTargets } from '@sentry/types';
import {
  dynamicSamplingContextToSentryBaggageHeader,
  fill,
  generateSentryTraceHeader,
  logger,
  LRUMap,
  stringMatchesSomePattern,
} from '@sentry/utils';
import { ClientRequest, ClientRequestConstructorOptions, IncomingMessage, net } from 'electron';
import * as urlModule from 'url';

type ShouldTraceFn = (method: string, url: string) => boolean;

interface NetOptions {
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

  /**
   * @deprecated Use `tracePropagationTargets` client option instead.
   *
   * Sentry.init({
   *   tracePropagationTargets: ['api.site.com'],
   * })
   */
  tracingOrigins?: ShouldTraceFn | boolean;
}

/** http module integration */
export class Net implements Integration {
  /** @inheritDoc */
  public static id: string = 'Net';

  /** @inheritDoc */
  public readonly name: string;

  /** @inheritDoc */
  public constructor(private readonly _options: NetOptions = {}) {
    this.name = Net.id;
  }

  /** @inheritDoc */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const clientOptions = getCurrentHub().getClient()?.getOptions();

    // No need to instrument if we don't want to track anything
    if (this._options.breadcrumbs === false && this._options.tracing === false) {
      return;
    }

    fill(net, 'request', createWrappedRequestFactory(this._options, clientOptions?.tracePropagationTargets));
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

/** */
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
    if (options.tracingOrigins === false) {
      return false;
    }

    // Neither integration nor client options are set or integration option is set to true
    if (
      (options.tracingOrigins === undefined && tracePropagationTargets === undefined) ||
      options.tracingOrigins === true
    ) {
      return true;
    }

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

    if (options.tracingOrigins) {
      const decision = options.tracingOrigins(method, url);
      headersUrlMap.set(key, decision);
      return decision;
    }

    // We cannot reach here since either `tracePropagationTargets` or `tracingOrigins` will be defined but TypeScript
    // cannot infer that
    return true;
  };

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

      const hub = getCurrentHub();
      const scope = hub.getScope();
      if (scope && shouldCreateSpan(method, url)) {
        const parentSpan = scope.getSpan();

        if (parentSpan) {
          span = parentSpan.startChild({
            description: `${method} ${url}`,
            op: 'http.client',
          });

          if (shouldAttachTraceData(method, url)) {
            const sentryTraceHeader = span.toTraceparent();
            const dynamicSamplingContext = span?.transaction?.getDynamicSamplingContext();

            addHeadersToRequest(request, url, sentryTraceHeader, dynamicSamplingContext);
          }
        } else {
          if (shouldAttachTraceData(method, url)) {
            const { traceId, sampled, dsc } = scope.getPropagationContext();
            const sentryTraceHeader = generateSentryTraceHeader(traceId, undefined, sampled);

            const client = hub.getClient();
            const dynamicSamplingContext =
              dsc || (client ? getDynamicSamplingContextFromClient(traceId, client, scope) : undefined);

            addHeadersToRequest(request, url, sentryTraceHeader, dynamicSamplingContext);
          }
        }
      }

      return request
        .once('response', function (this: ClientRequest, res: IncomingMessage): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;
          if (options.breadcrumbs !== false) {
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

          if (options.breadcrumbs !== false) {
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
