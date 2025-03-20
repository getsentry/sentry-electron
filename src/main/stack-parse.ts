import { createStackParser, nodeStackLineParser, StackFrame, StackParser } from '@sentry/core';
import { createGetModuleFromFilename } from '@sentry/node';
import { app, WebContents, WebFrameMain } from 'electron';

import { electronRendererStackParser } from '../renderer/stack-parse';
import { ELECTRON_MAJOR_VERSION } from './electron-normalize';

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
export async function captureRendererStackFrames(webContents: WebContents): Promise<StackFrame[]> {
  if (ELECTRON_MAJOR_VERSION < 34) {
    throw new Error('Electron >= 34 required to capture stack frames via `frame.collectJavaScriptCallStack()`');
  }

  const frame = webContents.mainFrame as ElectronV34Frame;

  const stack = await frame.collectJavaScriptCallStack();
  if (!stack) {
    return [];
  }

  return electronRendererStackParser(stack);
}
