import { chromeStackLineParser } from '@sentry/browser';
import { nodeStackLineParser, StackFrame, StackParser, stripSentryFramesAndReverse } from '@sentry/core';

const STACKTRACE_FRAME_LIMIT = 50;

const [, chrome] = chromeStackLineParser;
const [, node] = nodeStackLineParser();

/**
 * A stack parser than combines Chrome and node.js parsers to give the best results even when nodeIntegration = true
 */
export const electronRendererStackParser: StackParser = (stack: string, skipFirst: number = 0): StackFrame[] => {
  const frames: StackFrame[] = [];

  for (const line of stack.split('\n').slice(skipFirst)) {
    const chromeFrame = chrome(line);
    const nodeFrame = node(line);

    // We favour the chrome parser unless in_app == false
    if (chromeFrame && nodeFrame?.in_app !== false) {
      frames.push(chromeFrame);
    } else if (nodeFrame) {
      if (nodeFrame.module === undefined) {
        delete nodeFrame.module;
      }

      frames.push(nodeFrame);
    }

    if (frames.length >= STACKTRACE_FRAME_LIMIT) {
      break;
    }
  }

  return stripSentryFramesAndReverse(frames);
};
