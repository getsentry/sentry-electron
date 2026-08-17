import {
  SENTRY_ENVIRONMENT,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_PROFILE_ID,
  SENTRY_PROFILER_ID,
  SENTRY_RELEASE,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_SOURCE,
  SENTRY_TRACE_LIFECYCLE,
  URL_FULL,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpan, Span, SpanAttributes, SpanStatus } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  startSpanManual,
  timestampInSeconds,
} from '@sentry/core';

// `@sentry/conventions` has no exports for these yet. `sentry.segment.name.source` is set by the
// JavaScript SDK on segment spans from `sentry.source`, and the user agent attribute name is built
// dynamically from the request/response lifecycle.
const SENTRY_SEGMENT_NAME_SOURCE = 'sentry.segment.name.source';
const HTTP_REQUEST_HEADER_USER_AGENT = 'http.request.header.user_agent';

/** Converts a serialized span status into a `SpanStatus` */
export function parseStatus(status: string): SpanStatus {
  if (status === 'ok') {
    return { code: 1 };
  }

  return { code: 2, message: status };
}

function streamedAttr(span: SerializedStreamedSpan, key: string): string | undefined {
  return span.attributes?.[key]?.value as string | undefined;
}

// Attributes on the streamed pageload segment that describe the renderer segment itself (its
// identity, SDK metadata and profile linkage) rather than the measurements and trace metadata (Web
// Vitals, connection/device info, etc.) that should be merged onto the startup span.
//
// The profile ids are set on segment spans from the renderer scope and point at a renderer UI
// profile, so inheriting them would attach that profile to the main process startup span. The
// transaction path carries the same linkage in `contexts.profile` and does not transfer it either.
const NON_INHERITED_SEGMENT_ATTRIBUTES = new Set<string>([
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SOURCE,
  SENTRY_PROFILE_ID,
  SENTRY_PROFILER_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SENTRY_SEGMENT_NAME,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_SEGMENT_ID,
  SENTRY_TRACE_LIFECYCLE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_RELEASE,
  SENTRY_ENVIRONMENT,
  URL_FULL,
  HTTP_REQUEST_HEADER_USER_AGENT,
]);

// Attributes that pin a streamed child span to the original renderer segment or SDK. These are not
// copied to the re-created child spans because the main process SDK re-applies them for the merged
// startup trace.
const NON_COPIED_CHILD_ATTRIBUTES = new Set<string>([
  SENTRY_TRACE_LIFECYCLE,
  SENTRY_SEGMENT_NAME,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_SEGMENT_ID,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_RELEASE,
  SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
]);

function copyChildAttributes(span: SerializedStreamedSpan): SpanAttributes {
  const attributes: SpanAttributes = {};

  for (const [key, attribute] of Object.entries(span.attributes || {})) {
    if (!NON_COPIED_CHILD_ATTRIBUTES.has(key)) {
      attributes[key] = attribute.value;
    }
  }

  return attributes;
}

/**
 * Merges spans streamed from the renderer (when `traceLifecycle: 'stream'` is used) into the
 * startup span, mirroring `applyRendererSpansAndMeasurements` for the streamed span format.
 */
export function applyStreamedRendererSpans(
  parentSpan: Span,
  spans: SerializedStreamedSpan[],
  endTimestamp: number,
): number {
  let lastEndTimestamp = endTimestamp;

  if (!spans.length) {
    return lastEndTimestamp;
  }

  const segment = spans.find((span) => span.is_segment);
  const childSpans = spans.filter((span) => !span.is_segment);

  const rendererStartTime = segment?.start_timestamp || timestampInSeconds();
  parentSpan.setAttribute('performance.timeOrigin', rendererStartTime);

  // Merge the renderer pageload measurements and trace metadata onto the startup span
  if (segment?.attributes) {
    for (const [key, attribute] of Object.entries(segment.attributes)) {
      if (!NON_INHERITED_SEGMENT_ATTRIBUTES.has(key)) {
        parentSpan.setAttribute(key, attribute.value);
      }
    }
  }

  startSpanManual(
    {
      name: segment?.name || 'electron.renderer',
      op: 'electron.renderer',
      startTime: rendererStartTime,
      parentSpan,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.electron.startup',
      },
    },
    (rendererSpan) => {
      for (const span of childSpans) {
        const startTime = span.start_timestamp;
        const endTime = span.end_timestamp;

        if (endTime) {
          lastEndTimestamp = Math.max(lastEndTimestamp, endTime);
        }

        startSpanManual(
          {
            name: span.name,
            op: streamedAttr(span, SENTRY_OP),
            startTime,
            attributes: copyChildAttributes(span),
            parentSpan: rendererSpan,
          },
          (created) => {
            if (span.status) {
              created.setStatus(parseStatus(span.status));
            }

            created.end((endTime || startTime) * 1000);
          },
        );
      }

      // A pageload can end without any child spans, so the segment's own end time also has to be
      // considered or the renderer span would be closed at the `dom-ready` timestamp
      if (segment?.end_timestamp) {
        lastEndTimestamp = Math.max(lastEndTimestamp, segment.end_timestamp);
      }

      rendererSpan.end(lastEndTimestamp * 1000);
    },
  );

  return lastEndTimestamp;
}
