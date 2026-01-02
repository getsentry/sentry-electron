import { spawnSync } from 'node:child_process';

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

console.log(JSON.stringify(versions));

