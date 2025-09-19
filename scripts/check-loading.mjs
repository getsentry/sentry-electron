import { spawnSync } from 'node:child_process';

const result = spawnSync('yarn', ['electron', 'scripts/getPathCheck', '--no-sandbox'], { stdio: 'inherit' });

// We don't get the correct status on Windows 🤷‍♂️
if (process.platform === 'win32' && result.status !== 0) {
  process.exit(1);
}
