import { Event, Session } from '@sentry/types';
import { readFileSync } from 'fs';
import { join, sep } from 'path';

import { TestServerEvent } from '../server';
import { walkSync } from '../utils';

export interface TestMetadata {
  description: string;
  category?: string;
  condition?: string;
  command?: string;
  timeout?: number;
  runTwice?: boolean;
}

export interface TestRecipe {
  path: string;
  metadata: TestMetadata;
  files: Record<string, string>;
  expectedEvents: TestServerEvent<Event | Session>[];
}

function getDescription(doc: string): string {
  const match = doc.match(/^#\s+([\s\S]+?)$/m);

  if (!match) {
    throw new Error('Description not found');
  }

  return match[1];
}

function getTableValue(doc: string, row: string): string | undefined {
  const r = new RegExp(`${row}\\s*\\|\\s*([\\s\\S]+?)\\s*\\|`, 'gi');
  const match = r.exec(doc);
  return match ? match[1] : undefined;
}

function parseMetadata(doc: string): TestMetadata {
  const description = getDescription(doc);
  const category = getTableValue(doc, 'category');
  const condition = getTableValue(doc, 'run condition');
  const command = getTableValue(doc, 'build command');
  const timeoutStr = getTableValue(doc, 'timeout');
  const timeout = timeoutStr ? parseInt(timeoutStr.replace('s', '000')) : undefined;
  const runTwice = !!getTableValue(doc, 'run twice');

  return { description, category, command, condition, timeout, runTwice };
}

function isEventOrSession(path: string): boolean {
  return !!path.match(/(?:session|event).*\.json$/);
}

function getEventsAndSessions(rootDir: string): TestServerEvent<Event | Session>[] {
  return Array.from(walkSync(rootDir))
    .filter((path) => isEventOrSession(path))
    .map((path) => JSON.parse(readFileSync(path, { encoding: 'utf-8' })) as TestServerEvent<Event | Session>);
}

function getFiles(rootDir: string): Record<string, string> {
  return Array.from(walkSync(rootDir))
    .filter((path) => !isEventOrSession(path))
    .reduce((acc, absPath) => {
      const relPath = absPath.replace(rootDir + sep, '');
      acc[relPath] = readFileSync(absPath, { encoding: 'utf-8' });
      return acc;
    }, {} as Record<string, string>);
}

export function parseRecipe(rootPath: string): TestRecipe {
  const readme = readFileSync(join(rootPath, 'README.md'), { encoding: 'utf8' });

  return {
    path: rootPath,
    metadata: parseMetadata(readme),
    files: getFiles(rootPath),
    expectedEvents: getEventsAndSessions(rootPath),
  };
}
