import { createGetModuleFromFilename } from '@sentry/node';
import { StackParser } from '@sentry/types';
import { createStackParser, nodeStackLineParser } from '@sentry/utils';
import { app } from 'electron';
import { sep } from 'path';

// node.js stack parser but filename normalized before parsing the module
export const defaultStackParser: StackParser = createStackParser(
  nodeStackLineParser(createGetModuleFromFilename(app.getAppPath() + sep)),
);
