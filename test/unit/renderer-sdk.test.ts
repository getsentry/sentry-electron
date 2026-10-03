import type { Integration, Options } from '@sentry/core';
import { getIntegrationsToSetup } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { init } from '../../src/renderer/sdk';

function integration(name: string): Integration {
  return { name };
}

// Uses the same pattern as the framework SDKs, eg. `@sentry/vue`
function frameworkInit(defaults: Integration[]): {
  init: (options: Options) => void;
  names: () => string[];
  get: (name: string) => Integration | undefined;
} {
  let setup: Integration[] = [];
  return {
    init: (options) => {
      setup = getIntegrationsToSetup({ defaultIntegrations: defaults, ...options });
    },
    names: () => setup.map((i) => i.name),
    get: (name) => setup.find((i) => i.name === name),
  };
}

describe('renderer init', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  test('keeps framework default integrations', () => {
    const framework = frameworkInit([integration('Breadcrumbs'), integration('Vue')]);

    init({}, framework.init);

    expect(framework.names()).toEqual(['Breadcrumbs', 'Vue', 'ScopeToMain']);
  });

  test('removes integrations the renderer does not support', () => {
    const framework = frameworkInit([integration('BrowserSession'), integration('CultureContext'), integration('Vue')]);

    init({}, framework.init);

    expect(framework.names()).toEqual(['Vue', 'ScopeToMain']);
  });

  test('merges user integrations with the defaults', () => {
    const framework = frameworkInit([integration('Breadcrumbs'), integration('Vue')]);
    const userBreadcrumbs = integration('Breadcrumbs');

    init({ integrations: [integration('Custom'), userBreadcrumbs] }, framework.init);

    expect(framework.names()).toEqual(['Breadcrumbs', 'Vue', 'ScopeToMain', 'Custom']);
    expect(framework.get('Breadcrumbs')).toBe(userBreadcrumbs);
  });

  test('passes the defaults to a user integrations function', () => {
    const framework = frameworkInit([integration('Breadcrumbs'), integration('Vue')]);

    init({ integrations: (defaults) => defaults.filter((i) => i.name !== 'Breadcrumbs') }, framework.init);

    expect(framework.names()).toEqual(['Vue', 'ScopeToMain']);
  });

  test('adds no integrations when defaultIntegrations is false', () => {
    const framework = frameworkInit([integration('Vue')]);

    init({ defaultIntegrations: false, integrations: [integration('Custom')] }, framework.init);

    expect(framework.names()).toEqual(['Custom']);
  });
});
