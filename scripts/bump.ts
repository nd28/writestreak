import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const pkgPath = resolve(import.meta.dirname, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const parts = pkg.version.split(".").map(Number);

const type = process.argv[2] || "patch";

if (type === "patch") parts[2]++;
else if (type === "minor") { parts[1]++; parts[2] = 0; }
else if (type === "major") { parts[0]++; parts[1] = 0; parts[2] = 0; }
else { console.error(`Usage: bun scripts/bump.ts [patch|minor|major]`); process.exit(1); }

pkg.version = parts.join(".");
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Version bumped to ${pkg.version}`);
