import { defineIntegration } from '@sentry/core';
import { app } from 'electron';

import { getDefaultEnvironment, getDefaultReleaseName } from '../context';
import { mergeEvents } from '../merge';

export const electronContextIntegration = defineIntegration(() => {
  return {
    name: 'ElectronContext',
    processEvent(event, _, client) {
      // We don't want to send the server_name as it includes the machine name which is potentially PII
      delete event.server_name;
      // We delete the Node runtime context so our Electron runtime context is used instead
      delete event.contexts?.runtime;

      const { release = getDefaultReleaseName(), environment = getDefaultEnvironment() } = client.getOptions();

      const build_type = process.mas ? 'app-store' : process.windowsStore ? 'windows-store' : undefined;

      return mergeEvents(
        {
          contexts: {
            app: {
              app_name: app.name || app.getName(),
              app_version: app.getVersion(),
              build_type,
            },
            browser: {
              name: 'Chrome',
            },
            chrome: {
              name: 'Chrome',
              type: 'runtime',
              version: process.versions.chrome,
            },
            device: {
              arch: process.arch,
              family: 'Desktop',
            },
            node: {
              name: 'Node',
              type: 'runtime',
              version: process.versions.node,
            },
            runtime: {
              name: 'Electron',
              version: process.versions.electron,
            },
          },
          environment,
          release,
          tags: {
            'event.origin': 'electron',
            'event.environment': 'javascript',
            'event.process': 'browser',
          },
        },
        event,
      );
    },
  };
});
