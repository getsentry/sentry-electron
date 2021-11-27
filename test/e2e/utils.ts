import { getLatestVersions as getLatestElectronVersions } from 'electron-latest-versions';
import { readdirSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';

// When DEBUG is not enabled, we collect a log to output if a test fails
let TEST_LOG: any[][] = [];

export function clearTestLog(): void {
  TEST_LOG = [];
}

export function getTestLog(): string[] {
  const output = [];

  for (const args of TEST_LOG) {
    output.push(args.map((a) => (typeof a === 'string' ? a : inspect(a, false, null, true))).join(' '));
  }

  return output;
}

export function outputTestLog(): void {
  for (const args of TEST_LOG) {
    console.log(...args);
  }
}

export function createLogger(name: string): (...args: any[]) => void {
  return (...args: any[]) => {
    TEST_LOG.push([`[${name}]`, ...args]);

    if (process.env.DEBUG) {
      console.log(`[${name}]`, ...args);
    }
  };
}

/** Gets the Electron versions to test */
export async function getElectronTestVersions(): Promise<string[]> {
  if (process.env.ELECTRON_VERSION) {
    return [process.env.ELECTRON_VERSION];
  }

  return getLatestElectronVersions({ start: 2 });
}

export function* walkSync(dir: string): Generator<string> {
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* walkSync(join(dir, file.name));
    } else {
      yield join(dir, file.name);
    }
  }
}
