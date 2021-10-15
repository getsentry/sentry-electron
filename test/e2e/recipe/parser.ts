import { Event, Session } from '@sentry/types';
import { readFileSync } from 'fs';
import * as YAML from 'yaml';

import { TestServerEvent } from '../server';

const codeBlockRegex = /`([\w./]+)`\s*```\w*[\v\s]*([.\W\w]+?)\s*```/g;

interface CodeBlock {
  name: string;
  content: string;
}

export interface TestMetadata {
  description: string;
  condition?: string;
  command?: string;
  timeout?: number;
  runTwice?: boolean;
}

export interface TestRecipe {
  metadata: TestMetadata;
  files: Record<string, string>;
  expectedEvents: TestServerEvent<Event | Session>[];
}

function getMetadata(raw: string): TestMetadata {
  const fmMatch = raw.match(/^---([\s\S]+)---/);

  if (!fmMatch) {
    throw new Error('No test metadata found');
  }

  const [, frontMatter] = fmMatch;

  return YAML.parse(frontMatter);
}

function getCodeBlocks(raw: string): CodeBlock[] {
  const files: CodeBlock[] = [];

  let match;

  while ((match = codeBlockRegex.exec(raw)) !== null) {
    if (match.index === codeBlockRegex.lastIndex) {
      codeBlockRegex.lastIndex += 1;
    }

    const [, path, content] = match;

    files.push({ name: path, content });
  }

  return files;
}

function getEvents(raw: string): TestServerEvent<Event>[] {
  return getCodeBlocks(raw)
    .filter((b) => b.name === 'event')
    .map((b) => JSON.parse(b.content) as TestServerEvent<Event>);
}

function getSessions(raw: string): TestServerEvent<Session>[] {
  return getCodeBlocks(raw)
    .filter((b) => b.name === 'session')
    .map((b) => JSON.parse(b.content) as TestServerEvent<Session>);
}

function getFiles(raw: string): Record<string, string> {
  return getCodeBlocks(raw)
    .filter((b) => b.name !== 'event' && b.name !== 'session')
    .reduce((obj, file) => {
      obj[file.name] = file.content;
      return obj;
    }, {} as Record<string, string>);
}

export function parseRecipe(path: string): TestRecipe {
  const raw = readFileSync(path, { encoding: 'utf8' });

  return {
    metadata: getMetadata(raw),
    files: getFiles(raw),
    expectedEvents: [...getEvents(raw), ...getSessions(raw)],
  };
}
