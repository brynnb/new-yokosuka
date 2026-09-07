import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const archive = resolve(process.argv[2] || "vendor/lucky-break-engine.tgz");
const entries = execFileSync("tar", ["-tzf", archive], {encoding: "utf8"}).trim().split("\n");
for (const entry of entries) {
  if (!/^(?:package\/(?:package\.json|README\.md|LICENSE(?:\.txt|\.md)?)|package\/engine-dist\/index\.js|package\/engine-dist\/types\/[\w/.-]+\.d\.ts)$/.test(entry)
      || entry.split("/").includes("..")) {
    throw new Error(`Unexpected public engine package member: ${entry}`);
  }
}
if (!entries.includes("package/engine-dist/index.js")) throw new Error("Missing engine bundle");
for (const entry of entries) {
  const text = execFileSync("tar", ["-xOf", archive, entry], {encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  if (/sourceMappingURL\s*=|["']sourcesContent["']\s*:/.test(text)) {
    throw new Error(`Source map or embedded source in public engine package: ${entry}`);
  }
}
console.log(`Verified ${entries.length} public engine members: compiled JS, declarations and package metadata only.`);
