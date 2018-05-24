export { ElectronOptions } from './common';
export { ElectronFrontend } from './dispatch';
export { captureMinidump, init, getCurrentFrontend } from './sdk';

export {
  addBreadcrumb,
  captureMessage,
  captureException,
  captureEvent,
  setUserContext,
  setTagsContext,
  setExtraContext,
} from '@sentry/shim';
