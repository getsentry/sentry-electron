import { getModuleFromFilename as getModuleFromFilenameNode } from '@sentry/node';
import { StackParser } from '@sentry/types';
import { createStackParser, nodeStackLineParser } from '@sentry/utils';
import { app } from 'electron';

import { normalizeUrl } from '../common';

/** Parses the module name form a filename */
function getModuleFromFilename(filename: string | undefined): string | undefined {
  if (!filename) {
    return;
  }

  const normalizedFilename = normalizeUrl(filename, app.getAppPath());

  return getModuleFromFilenameNode(normalizedFilename);
}

// node.js stack parser but filename normalized before parsing the module
export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(getModuleFromFilename));
