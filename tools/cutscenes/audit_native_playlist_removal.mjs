#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditCanonicalOwnerProgram,
  auditCompiledOwnerProgram,
  auditLegacyPlaylistSurface,
} from "../lib/NativePlaylistRemovalAudit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = filename => JSON.parse(readFileSync(path.join(root, filename), "utf8"));
const productionSourceFiles = [];
const collectSourceFiles = relativeDirectory => {
  const directory = path.join(root, relativeDirectory);
  for (const entry of readdirSync(directory)) {
    const relativePath = path.join(relativeDirectory, entry);
    const absolutePath = path.join(root, relativePath);
    if (statSync(absolutePath).isDirectory()) {
      collectSourceFiles(relativePath);
    } else if (/\.(?:js|json)$/.test(entry)) {
      productionSourceFiles.push({
        path: relativePath,
        contents: readFileSync(absolutePath, "utf8"),
      });
    }
  }
};
for (const directory of ["play/config", "play/cutscenes", "play/events", "play/data/events"]) {
  collectSourceFiles(directory);
}
const combinedAuthPackPath = "play/assets/introduction/op00/OP00_A0114.authpack";
if (existsSync(path.join(root, combinedAuthPackPath))) {
  productionSourceFiles.push({ path: combinedAuthPackPath, contents: "OP00_A0114.authpack" });
}
const programPack = readJson("play/data/events/nativeEventPrograms.generated.json");
const bebf = auditCanonicalOwnerProgram({
  programPack,
  activityManifest: readJson("play/assets/hazuki/bebf/manifest.json"),
  expectedOwnerCalls: [
    [60, "0x4c244"], [61, "0x4c27a"], [62, "0x4c2b0"],
    [60, "0x4c30e"], [63, "0x4c344"], [62, "0x4c37a"],
  ].map(([slot, callFileOffset]) => ({ slot, callFileOffset })),
  programId: "disc1-jomo-bebf-nightmare-owner-0x4bf5c",
  helperFunction: "0x4b4f8",
});
const op00 = auditCompiledOwnerProgram({
  compiledProgram: readJson("play/assets/introduction/op00/cutscene-program.generated.json"),
  expected: {
    id: "S1-OP00-A0114",
    area: "OP00",
    entryFunction: "0x20350",
    authoredPathToken: "/AUTH01/0114/",
    slots: Array.from({ length: 24 }, (_, index) => index),
    completionBoundarySlot: 24,
  },
  activityManifest: readJson("play/assets/introduction/op00/manifest.json"),
});
const legacySurface = auditLegacyPlaylistSurface(productionSourceFiles);
const report = {
  schema: "new-yokosuka-native-playlist-removal-audit-v1",
  generatedBy: "tools/cutscenes/audit_native_playlist_removal.mjs",
  productionPlaylistConsumers: legacySurface.references,
  bebf,
  op00,
  legacySurface,
  cutoverComplete: bebf.cutoverReady && op00.cutoverReady && legacySurface.complete,
};
writeFileSync(
  path.join(root, "tools/evidence/native-playlist-removal.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log("Wrote tools/evidence/native-playlist-removal.json");
