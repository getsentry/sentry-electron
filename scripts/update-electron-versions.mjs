import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const output = join(__dirname, '..', 'test', 'e2e', 'versions.json');
const result = spawnSync('npm', ['view', 'electron', 'dist-tags', '--json'], { encoding: 'utf8' });
const allTags = JSON.parse(result.stdout);

const versions = [];
let startVersion = 23;

while (true) {
  const versionTag = `${startVersion}-x-y`;

  const version = allTags[versionTag];

  if (version) {
    versions.push(version);
    startVersion++;
  } else {
    break;
  }
}

writeFileSync(output, `${JSON.stringify(versions)}\n`);
