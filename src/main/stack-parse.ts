import { createStackParser, debug, nodeStackLineParser, StackFrame, StackParser } from '@sentry/core';
import { createGetModuleFromFilename } from '@sentry/node';
import { app, WebContents, WebFrameMain } from 'electron';
import { electronRendererStackParser } from '../renderer/stack-parse.js';
import { ELECTRON_MAJOR_VERSION } from './electron-normalize.js';

// node.js stack parser but filename normalized before parsing the module
export const defaultStackParser: StackParser = createStackParser(
  nodeStackLineParser(createGetModuleFromFilename(app.getAppPath())),
);

type ElectronV34Frame = WebFrameMain & {
  collectJavaScriptCallStack(): Promise<string> | Promise<void>;
};

/**
 * Captures stack frames from a renderer process
 *
 * Requires Electron >= 34 and throws an error on older versions
 *
 * @param webContents The WebContents to capture stack frames from
 * @returns A promise that resolves to an array of Sentry StackFrames
 */
export async function captureRendererStackFrames(webContents: WebContents): Promise<StackFrame[] | undefined> {
  if (ELECTRON_MAJOR_VERSION < 34) {
    throw new Error('Electron >= 34 required to capture stack frames via `frame.collectJavaScriptCallStack()`');
  }

  if (webContents.isDestroyed()) {
    return undefined;
  }

  const frame = webContents.mainFrame as ElectronV34Frame;

  const stack = await frame.collectJavaScriptCallStack();
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
