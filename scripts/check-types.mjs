import { promises as fs } from 'node:fs';
import * as path from 'node:path';

async function walk(dir, ty) {
  let files = await fs.readdir(dir);
  files = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return filePath.endsWith('node_modules') ? [] : walk(filePath, ty);
      } else if (stats.isFile() && file.endsWith(ty)) {
        return filePath;
      }
    }),
  );

  return files.filter(Boolean).reduce((all, f) => all.concat(f), []);
}

// Find all the .d.ts files in the project
const typeDefs = await walk(process.cwd(), '.d.ts');

// Check for any sub-module imports in the type definitions
const regex = /import\("@sentry\/.+\//gi;
let failed = false;

for (const file of typeDefs) {
  const content = await fs.readFile(file, 'utf-8');
  const matches = content.match(regex);
  if (matches) {
    console.log(`Sub-module import in type def file '${file}':\n`, matches);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
