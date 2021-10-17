// Yarn has a bug where 'yarn cache clean @sentry/electron' does not
// remove the temp directory where the tgz is unpacked to. This means
// installing from local tgz does not update when src changes are made
// https://github.com/yarnpkg/yarn/issues/5357

const { spawnSync } = require('child_process');
const { rmSync } = require('fs');
const { join } = require('path');

spawnSync('yarn cache clean @sentry/electron', { shell: true, stdio: 'inherit' });
const dirResult = spawnSync('yarn cache dir', { shell: true });

const tmpDir = join(dirResult.output.toString().replace(/[,\n\r]/g, ''), '.tmp');
rmSync(tmpDir, { recursive: true, force: true });
