// tslint:disable-next-line
require('util.promisify/shim')();

export { ElectronBackend, ElectronOptions } from './backend';
export { ElectronFrontend } from './frontend';
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
