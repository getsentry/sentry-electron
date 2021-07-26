import { Event } from '@sentry/types';

export const IPC = {
  /** IPC to send a captured event to Sentry. */
  EVENT: 'sentry-electron.event',
  /** IPC to capture scope globally. */
  SCOPE: 'sentry-electron.scope',
  /** IPC to get Electron scope in renderer */
  CONTEXT: 'sentry-electron.context',
};

export interface AppContext {
  eventDefaults: Event;
  appBasePath: string;
}

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    __SENTRY_IPC__?: {
      sendScope: (scope: string) => void;
      sendEvent: (event: string) => void;
      getContext: (callback: (contextJson: string) => void) => void;
    };
  }
}
