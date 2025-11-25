import {
  AttachmentItem,
  Contexts,
  Envelope,
  Event,
  FeedbackEvent,
  parseSemver,
  ProfileChunk,
  ProfileItem,
  SdkInfo,
  SerializedSession,
  TransactionEvent,
} from '@sentry/core';
import { readdirSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';
import { expect } from 'vitest';
import { SDK_VERSION } from '../../src/main/version';

export interface TestLogger {
  createLogger(name: string): (...args: any[]) => void;
  getLogOutput(): string[];
  outputTestLog(): void;
}

export function createTestLogger(): TestLogger {
  const TEST_LOG: any[][] = [];

  return {
    createLogger(name: string): (...args: any[]) => void {
      return (...args: any[]) => {
        TEST_LOG.push([`[${name}]`, ...args]);

        if (process.env.DEBUG) {
          console.log(`[${name}]`, ...args);
        }
      };
    },
    getLogOutput(): string[] {
      const output = [];

      for (const args of TEST_LOG) {
        output.push(args.map((a) => (typeof a === 'string' ? a : inspect(a, false, null, true))).join(' '));
      }

      return output;
    },
    outputTestLog(): void {
      for (const args of TEST_LOG) {
        console.log(...args);
      }
    },
  };
}

export function* walkSync(dir: string): Generator<string> {
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* walkSync(join(dir, file.name));
    } else {
      yield join(dir, file.name);
    }
  }
}

export function getCurrentElectronVersion() {
  if (!process.env.ELECTRON_VERSION) {
    throw new Error('ELECTRON_VERSION is not set');
  }
  const version = parseSemver(process.env.ELECTRON_VERSION);
  return {
    major: version.major || 0,
    minor: version.minor || 0,
    patch: version.patch || 0,
    string: process.env.ELECTRON_VERSION,
  };
}

export const UUID_MATCHER = expect.stringMatching(/^[0-9a-f]{32}$/);
export const UUID_V4_MATCHER = expect.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);
export const SHORT_UUID_MATCHER = expect.stringMatching(/^[0-9a-f]{16}$/);
export const ISO_DATE_MATCHER = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

function dropUndefinedKeys<T extends Record<string, any>>(obj: T): T {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete obj[key];
    }
  }
  return obj;
}

function getSdk(sdk: SdkInfo | undefined): SdkInfo {
  return {
    integrations: expect.any(Array),
    name: 'sentry.javascript.electron',
    packages: [
      {
        name: 'npm:@sentry/electron',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
    settings: { infer_ip: 'never' },
    ...sdk,
  };
}

function defaultContexts(eventContexts: Contexts = {}): Contexts {
  return expect.objectContaining(
    dropUndefinedKeys({
      trace: {
        trace_id: UUID_MATCHER,
        span_id: SHORT_UUID_MATCHER,
      },
      app: expect.objectContaining({
        app_start_time: ISO_DATE_MATCHER,
        app_memory: expect.any(Number),
        app_name: expect.any(String),
        app_version: expect.any(String),
        app_arch: expect.any(String),
      }),
      browser: { name: 'Chrome' },
      chrome: {
        name: 'Chrome',
        type: 'runtime',
        version: expect.any(String),
      },
      device: {
        boot_time: ISO_DATE_MATCHER,
        arch: expect.any(String),
        memory_size: expect.any(Number),
        free_memory: expect.any(Number),
        processor_count: expect.any(Number),
        cpu_description: expect.any(String),
        processor_frequency: expect.any(Number),
        family: 'Desktop',
        screen_density: expect.any(Number),
        screen_resolution: expect.any(String),
      },
      node: {
        name: 'Node',
        type: 'runtime',
        version: expect.any(String),
      },
      runtime: {
        name: 'Electron',
        version: expect.any(String),
      },
      os: expect.objectContaining({
        name: expect.any(String),
        version: expect.any(String),
      }),
      culture: {
        locale: expect.any(String),
        timezone: expect.any(String),
      },
      ...eventContexts,
    }),
  );
}

function defaultContextsNoLive(eventContexts: Contexts = {}): Contexts {
  return expect.objectContaining(
    dropUndefinedKeys({
      trace: {
        trace_id: UUID_MATCHER,
        span_id: SHORT_UUID_MATCHER,
      },
      app: expect.objectContaining({
        app_start_time: ISO_DATE_MATCHER,
        app_name: expect.any(String),
        app_version: expect.any(String),
        app_arch: expect.any(String),
      }),
      browser: { name: 'Chrome' },
      chrome: {
        name: 'Chrome',
        type: 'runtime',
        version: expect.any(String),
      },
      device: {
        boot_time: ISO_DATE_MATCHER,
        arch: expect.any(String),
        memory_size: expect.any(Number),
        processor_count: expect.any(Number),
        cpu_description: expect.any(String),
        processor_frequency: expect.any(Number),
        family: 'Desktop',
      },
      node: {
        name: 'Node',
        type: 'runtime',
        version: expect.any(String),
      },
      runtime: {
        name: 'Electron',
        version: expect.any(String),
      },
      os: expect.objectContaining({
        name: expect.any(String),
        version: expect.any(String),
      }),
      culture: {
        locale: expect.any(String),
        timezone: expect.any(String),
      },
      ...eventContexts,
    }),
  );
}

type Additions = AttachmentItem | ProfileItem;

export function expectedEvent(event: Event): Event {
  return dropUndefinedKeys({
    event_id: UUID_MATCHER,
    timestamp: expect.any(Number),
    environment: 'development',
    release: expect.any(String),
    breadcrumbs: expect.any(Array),
    ...event,
    sdk: getSdk(event.sdk),
    contexts: defaultContexts(event.contexts),
  });
}

export function expectedEventNoLiveContext(event: Event): Event {
  return dropUndefinedKeys({
    event_id: UUID_MATCHER,
    environment: 'development',
    release: expect.any(String),
    breadcrumbs: expect.any(Array),
    ...event,
    sdk: getSdk(event.sdk),
    contexts: defaultContextsNoLive(event.contexts),
  });
}

export function eventEnvelope(event: Event, ...otherEnvelopeItems: Additions[]): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION },
      trace: {
        environment: event.environment || 'development',
        release: event.release || expect.any(String),
        public_key: UUID_MATCHER,
        trace_id: UUID_MATCHER,
      },
    },
    [[{ type: 'event' }, expectedEvent(event)], ...otherEnvelopeItems],
  ];
}

export function eventEnvelopeNoLiveContext(event: Event, ...otherEnvelopeItems: Additions[]): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION },
    },
    [[{ type: 'event' }, expectedEventNoLiveContext(event)], ...otherEnvelopeItems],
  ];
}

export function feedbackEnvelope(event: Partial<FeedbackEvent>, ...otherEnvelopeItems: Additions[]): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION },
      trace: {
        environment: event.environment || 'development',
        release: event.release || expect.any(String),
        public_key: UUID_MATCHER,
        trace_id: UUID_MATCHER,
      },
    },
    [
      [
        { type: 'feedback' },
        {
          event_id: UUID_MATCHER,
          timestamp: expect.any(Number),
          environment: 'development',
          release: expect.any(String),
          breadcrumbs: expect.any(Array),
          ...event,
          sdk: getSdk(event.sdk),
          contexts: defaultContexts(event.contexts),
        },
      ],
      ...otherEnvelopeItems,
    ],
  ];
}

export function transactionEnvelope(event: TransactionEvent, ...otherEnvelopeItems: Additions[]): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION },
      trace: expect.objectContaining({
        environment: event.environment || 'development',
        release: event.release || expect.any(String),
        public_key: UUID_MATCHER,
        trace_id: UUID_MATCHER,
        sample_rand: expect.any(String),
        sample_rate: expect.any(String),
        sampled: expect.any(String),
      }),
    },
    [
      [
        { type: 'transaction' },
        {
          event_id: UUID_MATCHER,
          timestamp: expect.any(Number),
          environment: 'development',
          release: expect.any(String),
          start_timestamp: expect.any(Number),
          breadcrumbs: expect.any(Array),
          ...event,
          sdk: getSdk(event.sdk),
          contexts: defaultContexts(event.contexts),
        },
      ],
      ...otherEnvelopeItems,
    ],
  ];
}

export function sessionEnvelope(session: SerializedSession): Envelope {
  return [
    {
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION },
    },
    [
      [
        { type: 'session' },
        {
          attrs: expect.any(Object),
          ...session,
        },
      ],
    ],
  ];
}

export function getEventFromEnvelope(envelope: Envelope): Event | undefined {
  const event = envelope[1]?.[0]?.[1] as Event | undefined;
  return event;
}

export function getSessionFromEnvelope(envelope: Envelope): SerializedSession | undefined {
  const session = envelope[1]?.[0]?.[1] as SerializedSession | undefined;
  return session;
}

export function isSessionEnvelope(envelope: Envelope): boolean {
  return envelope[1][0][0].type === 'session';
}

export function profileChunkEnvelope(chunk: Partial<ProfileChunk>): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION },
    },
    [
      [
        { type: 'profile_chunk' },
        {
          chunk_id: UUID_MATCHER,
          profiler_id: UUID_MATCHER,
          platform: 'javascript',
          version: '2',
          release: 'some-release',
          environment: 'development',
          client_sdk: expect.any(Object),
          debug_meta: expect.any(Object),
          profile: expect.objectContaining({
            samples: expect.arrayContaining([
              expect.objectContaining({
                stack_id: expect.any(Number),
                thread_id: expect.any(String),
                timestamp: expect.any(Number),
              }),
            ]),
            stacks: expect.any(Array),
            frames: expect.arrayContaining([
              expect.objectContaining({
                function: expect.any(String),
              }),
            ]),
            thread_metadata: expect.any(Object),
          }),
          ...chunk,
        },
      ],
    ],
  ];
}
