/** IPC to send a captured event (exception or message) to Sentry. */
export const IPC_EVENT = 'sentry-electron.event';
/** IPC to capture a breadcrumb globally. */
export const IPC_CRUMB = 'sentry-electron.breadcrumbs';
/** IPC to capture new context (user, tags, extra) globally. */
export const IPC_CONTEXT = 'sentry-electron.context';
