import type { Event, Integration, StackFrame } from '@sentry/core';
import { join } from 'path';
import { describe, expect, test, vi } from 'vitest';
import { limitContextLinesForRendererEvents, markRendererEvent } from '../../src/main/renderer-event';

const APP_PATH = join(__dirname, 'app');

function createIntegration(name: string): { integration: Integration; processEvent: ReturnType<typeof vi.fn> } {
  const processEvent = vi.fn((event: Event) => {
    for (const frame of event.exception?.values?.[0]?.stacktrace?.frames || []) {
      frame.context_line = 'context';
    }
    return event;
  });
  return { integration: { name, processEvent }, processEvent };
}

function createEvent(filenames: string[]): Event {
  return {
    exception: {
      values: [{ type: 'Error', stacktrace: { frames: filenames.map((filename) => ({ filename, lineno: 1 })) } }],
    },
  };
}

function frames(event: Event | null | PromiseLike<Event | null>): StackFrame[] {
  return (event as Event).exception?.values?.[0]?.stacktrace?.frames || [];
}

describe('limitContextLinesForRendererEvents', () => {
  test('Only adds context lines to renderer frames in the app directory', async () => {
    const { integration } = createIntegration('ContextLines');
    const wrapped = limitContextLinesForRendererEvents(integration, () => APP_PATH);

    const inApp = join(APP_PATH, 'src', 'preload.js');
    const outsideApp = join(__dirname, 'other', 'file.js');
    const event = createEvent([
      inApp,
      outsideApp,
      join(APP_PATH, '..', 'app-other', 'file.js'),
      'app:///src/index.html',
    ]);
    markRendererEvent(event);

    const result = await wrapped.processEvent?.(event, {}, {} as never);

    expect(result).toBe(event);
    expect(frames(event).map((frame) => frame.context_line)).toEqual(['context', undefined, undefined, undefined]);
  });

  test('Adds context lines to all frames of other events', async () => {
    const { integration, processEvent } = createIntegration('ContextLines');
    const wrapped = limitContextLinesForRendererEvents(integration, () => APP_PATH);

    const event = createEvent([join(__dirname, 'other', 'file.js')]);

    const result = await wrapped.processEvent?.(event, {}, {} as never);

    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(frames(result as Event).map((frame) => frame.context_line)).toEqual(['context']);
  });

  test('Does not change other integrations', () => {
    const { integration } = createIntegration('NormalizePaths');

    expect(limitContextLinesForRendererEvents(integration, () => APP_PATH)).toBe(integration);
  });
});
