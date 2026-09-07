#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const args = process.argv.slice(2);
const logicPath = path.resolve(
  args.shift() || "tools/evidence/d000-door-logic.json",
);
let modelsDirectory = path.resolve(
  ".disc-work/exact/d000/mpk00-pks",
);
let outputPath = "";
while (args.length > 0) {
  const argument = args.shift();
  if (argument === "--models") modelsDirectory = path.resolve(args.shift());
  else if (argument === "--out") outputPath = path.resolve(args.shift());
  else {
    console.error(`Unknown argument: ${argument}`);
    process.exit(2);
  }
}

function signedRenderKey(node) {
  const key = node.flag & 0xffff;
  return key >= 0x8000 ? key - 0x10000 : key;
}

const logic = JSON.parse(fs.readFileSync(logicPath, "utf8"));
const doorsByModel = new Map();
for (const door of logic.doors) {
  const doors = doorsByModel.get(door.model) || [];
  doors.push(door);
  doorsByModel.set(door.model, doors);
}

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const models = [];
for (const [model, doors] of [...doorsByModel].sort()) {
  const filename = model
    .replace(/^S1_D000_/, "")
    .replace(/\.MT5$/i, ".CHRM");
  const file = path.join(modelsDirectory, filename);
  const source = fs.readFileSync(file);
  const buffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  );
  const roots = await new Mt5Loader(scene).load(buffer, null);
  const renderKeys = [...new Set(roots.flatMap((root) => (
    (root._mt5Nodes || []).map(signedRenderKey)
  )))].sort((left, right) => left - right);
  const flags = Object.fromEntries(
    [...new Set(doors.map((door) => door.runtime.recordWords[1]))]
      .sort()
      .map((flag) => [
        flag,
        doors.filter(
          (door) => door.runtime.recordWords[1] === flag,
        ).length,
      ]),
  );
  models.push({
    model,
    sourceFile: path.relative(process.cwd(), file),
    logicalDoorCount: doors.length,
    selectors: doors.map((door) => door.selector),
    logicalRecordFlags: flags,
    renderKeys,
    primaryNode12Present: renderKeys.includes(12),
    pairedNode7Present: renderKeys.includes(7),
  });
  roots.forEach((root) => root.dispose());
}
engine.dispose();

const failures = models.filter((model) => !model.primaryNode12Present);
const report = {
  schema: "new-yokosuka-d000-door-model-audit-v1",
  source: {
    logicalDoors: path.relative(process.cwd(), logicPath),
    modelsDirectory: path.relative(process.cwd(), modelsDirectory),
  },
  method: (
    "Load every distinct visible D000 door through the production MT5 "
    + "loader and verify the primary render-node route selected by the "
    + "native generic door operation."
  ),
  summary: {
    logicalDoorCount: logic.doors.length,
    distinctModelCount: models.length,
    primaryNode12VerifiedCount: models.length - failures.length,
    pairedNode7ModelCount: models.filter(
      (model) => model.pairedNode7Present,
    ).length,
    failureCount: failures.length,
  },
  failures,
  models,
};
const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encoded);
  console.log(`Wrote ${outputPath} (${failures.length} failures)`);
} else {
  process.stdout.write(encoded);
}
process.exitCode = failures.length === 0 ? 0 : 1;
