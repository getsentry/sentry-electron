export { ElectronBackend, ElectronOptions } from './backend';
export { ElectronFrontend } from './frontend';
export { captureMinidump, create, getCurrentFrontend } from './sdk';

export {
  addBreadcrumb,
  captureMessage,
  captureException,
  captureEvent,
  setUserContext,
  setTagsContext,
  setExtraContext,
} from '@sentry/shim';
