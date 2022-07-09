import { chromeStackLineParser } from '@sentry/browser';
import { StackFrame, StackParser } from '@sentry/types';
import { dropUndefinedKeys, nodeStackLineParser, stripSentryFramesAndReverse } from '@sentry/utils';

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
      frames.push(dropUndefinedKeys(nodeFrame));
    }
  }

  return stripSentryFramesAndReverse(frames);
};
