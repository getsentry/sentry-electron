export const IPC = {
  /** IPC to send a captured event (exception or message) to Sentry. */
  EVENT: 'sentry-electron.event',
  /** IPC to capture a scope globally. */
  SCOPE: 'sentry-electron.scope',
};

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    __SENTRY_IPC__?: {
      sendScope: (scope: string) => void;
      sendEvent: (event: string) => void;
    };
  }
}
