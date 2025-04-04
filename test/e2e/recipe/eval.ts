import { parseSemver } from '@sentry/core';
import { Context, createContext, runInContext } from 'vm';

import { createLogger } from '../utils';

const log = createLogger('Condition');

function getEvalContext(electronVersion: string): Context {
  const parsed = parseSemver(electronVersion);
  const version = { major: parsed.major || 0, minor: parsed.minor || 0, patch: parsed.patch || 0 };
  const platform = process.platform;

  const supportsSandbox = platform !== 'linux' || version.major >= 13;

  const supportsContextIsolation = version.major >= 6;

  return createContext({ version, platform, supportsContextIsolation, supportsSandbox });
}

export function evaluateCondition(name: string, electronVersion: string, condition: string | undefined): boolean {
  if (condition == undefined) {
    return true;
  }

  log(`Evaluating ${name} condition: '${condition}'`);

  const context = getEvalContext(electronVersion);
  const result = runInContext(condition, context);

  if (result == false) {
    log(`Result equals false. Skipping ${name}.`);
  } else {
    log('Result equals true.');
  }

  return result;
}
