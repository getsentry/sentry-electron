import { spawnSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as YAML from 'yaml';

export function createLogger(name: string): (...args: any[]) => void {
  if (process.env.DEBUG) {
    return (...args: any[]) => console.log(`[${name}]`, ...args);
  } else {
    return (_) => {
      //
    };
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

export function getCrashesDirectory(electronPath: string): string {
  const appPath = join(__dirname, 'test-apps', 'crashes-directory');
  const result = spawnSync(electronPath, [appPath], { shell: true, encoding: 'utf-8' });
  return result.output.join('').replace(/[\n\r]/, '');
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
