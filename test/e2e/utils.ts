import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as YAML from 'yaml';

// When DEBUG is not enabled, we collect a log to output if a test fails
let TEST_LOG: any[][] = [];

export function clearTestLog(): void {
  TEST_LOG = [];
}

export function getTestLog(): string[] {
  const output = [];

  for (const args of TEST_LOG) {
    output.push(args.map((a) => a.toString()).join(' '));
  }

  return output;
}

export function outputTestLog(): void {
  for (const args of TEST_LOG) {
    console.log(...args);
  }
}

export function createLogger(name: string): (...args: any[]) => void {
  if (process.env.DEBUG) {
    return (...args: any[]) => {
      console.log(`[${name}]`, ...args);
      TEST_LOG.push([`[${name}]`, ...args]);
    };
  } else {
    return (...args: any[]) => TEST_LOG.push([`[${name}]`, ...args]);
  }
}

/** Gets the Electron versions to test */
export function getTestVersions(): string[] {
  if (process.env.ELECTRON_VERSION) {
    return [process.env.ELECTRON_VERSION];
  }

  const ciBuildStr = readFileSync(join(__dirname, '..', '..', '.github', 'workflows', 'build.yml'), {
    encoding: 'utf8',
  });

  const ci = YAML.parse(ciBuildStr);

  return ci.jobs.job_4.strategy.matrix.electron;
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
