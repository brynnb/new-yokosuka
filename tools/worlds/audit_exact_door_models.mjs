#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const manifestPath = process.argv[2]
  || "play/data/native-map-transitions.json";
const outputPath = process.argv[3]
  || "tools/evidence/exact-door-model-audit.json";
const assetBase = (
  process.env.NEW_YOKOSUKA_ASSET_BASE
  || "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue"
).replace(/\/$/, "");

function signedRenderKey(node) {
  const key = node.flag & 0xffff;
  return key >= 0x8000 ? key - 0x10000 : key;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const transitions = manifest.allExactDoorTransitions;
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const models = [];
try {
  for (const transition of transitions) {
    const { model } = transition.source;
    const response = await fetch(`${assetBase}/${model}`);
    if (!response.ok) {
      models.push({
        area: transition.source.area,
        objectTag: transition.source.objectTag,
        model,
        status: "fetch-failed",
        httpStatus: response.status,
      });
      continue;
    }
    const buffer = await response.arrayBuffer();
    const roots = await new Mt5Loader(scene).load(buffer, null);
    const renderKeys = [...new Set(roots.flatMap((root) => (
      (root._mt5Nodes || []).map(signedRenderKey)
    )))].sort((left, right) => left - right);
    models.push({
      area: transition.source.area,
      objectTag: transition.source.objectTag,
      model,
      status: "verified",
      sha256: crypto
        .createHash("sha256")
        .update(new Uint8Array(buffer))
        .digest("hex"),
      byteLength: buffer.byteLength,
      renderKeys,
      primaryMovingNode: 12,
      genericMovingNodePresent: renderKeys.includes(12),
      alternateMovingNodePresent: renderKeys.includes(7),
      modelResolution: transition.evidence.modelResolution,
      controllerRecordFileOffset: transition.evidence.recordFileOffset,
    });
    roots.forEach((root) => root.dispose());
  }
} finally {
  engine.dispose();
}

const failures = models.filter((model) => model.status !== "verified");
const report = {
  schema: "new-yokosuka-exact-door-model-audit-v1",
  generatedFrom: manifestPath,
  assetBase,
  method: (
    "Load every canonical exact door model through the production MT5 loader "
    + "and inventory native moving render node 12. Model selection comes "
    + "from CHRT DefImage bindings, exact authored names, or a unique area "
    + "asset."
  ),
  summary: {
    transitionCount: transitions.length,
    verifiedModelCount: models.length - failures.length,
    genericMovingNodeCount: models.filter(
      (model) => model.genericMovingNodePresent,
    ).length,
    motionClassUnresolvedCount: models.filter(
      (model) => !model.genericMovingNodePresent,
    ).length,
    failureCount: failures.length,
  },
  models,
  failures,
  evidenceBoundary: (
    "This verifies resource availability and records whether the generic "
    + "moving-door node exists. MKYU DR02_001 is root-only and therefore "
    + "remains a distinct unresolved motion class; it is not forced through "
    + "the generic node-12 animation. Native interaction-box dimensions also "
    + "remain unresolved."
  ),
};
fs.mkdirSync(new URL("../evidence/", import.meta.url), {
  recursive: true,
});
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${report.summary.verifiedModelCount}/`
  + `${report.summary.transitionCount} exact door models verified`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
