import { Event, Session } from '@sentry/types';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, sep } from 'path';
import YAML from 'yaml';

import { TestServerEvent } from '../server';
import { walkSync } from '../utils';

type ConditionalTestServerEvent = TestServerEvent<Event | Session> & { condition?: string };

export interface TestMetadata {
  description: string;
  category?: string;
  command?: string;
  condition?: string;
  timeout?: number;
  runTwice?: boolean;
  expectedError?: string;
  distPath?: string;
  skipEsmAutoTransform?: boolean;
  waitAfterExpectedEvents?: number;
}

export interface TestRecipe {
  path: string;
  only: boolean;
  metadata: TestMetadata;
  files: Record<string, string>;
  expectedEvents: ConditionalTestServerEvent[];
  customScriptPath?: string;
}

function isEventOrSession(path: string): boolean {
  return !!path.match(/(?:session|event)[^/\\]*\.json$/);
}

function getEventsAndSessions(rootDir: string): ConditionalTestServerEvent[] {
  return Array.from(walkSync(rootDir))
    .filter((path) => isEventOrSession(path))
    .map((path) => JSON.parse(readFileSync(path, { encoding: 'utf-8' })) as ConditionalTestServerEvent);
}

function getCustomScript(rootDir: string): string | undefined {
  return readdirSync(rootDir)
    .map((path) => join(rootDir, path))
    .find((path) => path.endsWith('.ts'));
}

function getFiles(rootDir: string): Record<string, string> {
  return Array.from(walkSync(rootDir))
    .filter((path) => !isEventOrSession(path) && !path.endsWith('recipe.yml'))
    .reduce((acc, absPath) => {
      const relPath = absPath.replace(rootDir + sep, '');
      acc[relPath] = readFileSync(absPath, { encoding: 'utf-8' });
      return acc;
    }, {} as Record<string, string>);
}

export function parseRecipe(ymlPath: string): TestRecipe {
  const rootPath = dirname(ymlPath);

  return {
    path: rootPath,
    only: ymlPath.endsWith('only.yml'),
    metadata: YAML.parse(readFileSync(ymlPath, { encoding: 'utf8' })),
    files: getFiles(rootPath),
    expectedEvents: getEventsAndSessions(rootPath),
    customScriptPath: getCustomScript(rootPath),
  };
}
