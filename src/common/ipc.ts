import { Event } from '@sentry/types';

export enum IPC {
  /** IPC to send a captured event to Sentry. */
  EVENT = 'sentry-electron.event',
  /** IPC to capture scope globally. */
  SCOPE = 'sentry-electron.scope',
  /** IPC to get Electron scope in renderer */
  CONTEXT = 'sentry-electron.context',
}

export interface AppContext {
  eventDefaults: Event;
  appBasePath: string;
}

export interface IPCInterface {
  sendScope: (scope: string) => void;
  sendEvent: (event: string) => void;
  getContext: (callback: (context: string) => void) => void;
}

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    __SENTRY_IPC__?: IPCInterface;
  }
}
