import { createStackParser, nodeStackLineParser } from '@sentry/core';
import { createGetModuleFromFilename } from '@sentry/node';
import { StackParser } from '@sentry/types';
import { app } from 'electron';

// node.js stack parser but filename normalized before parsing the module
export const defaultStackParser: StackParser = createStackParser(
  nodeStackLineParser(createGetModuleFromFilename(app.getAppPath())),
);
