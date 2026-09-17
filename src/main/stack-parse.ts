import type { StackFrame, StackParser } from '@sentry/core';
import { createStackParser, debug } from '@sentry/core';
import { nodeStackLineParser } from '@sentry/core/server';
import { createGetModuleFromFilename } from '@sentry/node';
import type { WebContents } from 'electron';
import { app } from 'electron';
import { electronRendererStackParser } from '../renderer/stack-parse.js';

// node.js stack parser but filename normalized before parsing the module
export const defaultStackParser: StackParser = createStackParser(
  nodeStackLineParser(createGetModuleFromFilename(app.getAppPath())),
);

/**
 * Captures stack frames from a renderer process
 *
 * @param webContents The WebContents to capture stack frames from
 * @returns A promise that resolves to an array of Sentry StackFrames
 */
export async function captureRendererStackFrames(webContents: WebContents): Promise<StackFrame[] | undefined> {
  if (webContents.isDestroyed()) {
    return undefined;
  }

  const stack = await webContents.mainFrame.collectJavaScriptCallStack();
  if (!stack) {
    return undefined;
  }

  if (stack.includes('Website owner has not opted in')) {
    debug.warn(
      "Could not collect renderer stack frames.\nA 'Document-Policy' header of 'include-js-call-stacks-in-crash-reports' must be set",
    );
    return undefined;
  }

  return electronRendererStackParser(stack);
}
