const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

// Patch package.json to point to the correct main file which is in an arch specific directory
// Forge moves this into the packaged app to test but we're using the raw webpack output
const path = join(__dirname, "package.json");
const pkgJson = JSON.parse(readFileSync(path, 'utf8'));
pkgJson.main = `.webpack/${process.arch}/main`;
writeFileSync(path, JSON.stringify(pkgJson, null, 2), 'utf8');
