import type { Event, Integration } from '@sentry/core';
import { describe, expect, test, vi } from 'vitest';
import { markRendererEvent, skipContextLinesForRendererEvents } from '../../src/main/renderer-event';

function createIntegration(name: string): { integration: Integration; processEvent: ReturnType<typeof vi.fn> } {
  const processEvent = vi.fn((event: Event) => ({ ...event, extra: { processed: true } }));
  return { integration: { name, processEvent }, processEvent };
}

describe('skipContextLinesForRendererEvents', () => {
  test('Skips ContextLines for renderer events', () => {
    const { integration, processEvent } = createIntegration('ContextLines');
    const wrapped = skipContextLinesForRendererEvents(integration);

    const event: Event = { message: 'renderer' };
    markRendererEvent(event);

    expect(wrapped.processEvent?.(event, {}, {} as never)).toBe(event);
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('Runs ContextLines for other events', () => {
    const { integration, processEvent } = createIntegration('ContextLines');
    const wrapped = skipContextLinesForRendererEvents(integration);

    const event: Event = { message: 'main' };

    expect(wrapped.processEvent?.(event, {}, {} as never)).toEqual({ message: 'main', extra: { processed: true } });
    expect(processEvent).toHaveBeenCalledTimes(1);
  });

  test('Does not change other integrations', () => {
    const { integration } = createIntegration('NormalizePaths');

    expect(skipContextLinesForRendererEvents(integration)).toBe(integration);
  });
});
