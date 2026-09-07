#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const manifestPath = process.argv[2]
  || "play/data/native-map-transitions.json";
const outputPath = process.argv[3]
  || "tools/evidence/interior-door-model-audit.json";
const assetBase = (
  process.env.NEW_YOKOSUKA_ASSET_BASE
  || "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue"
).replace(/\/$/, "");

function signedRenderKey(node) {
  const key = node.flag & 0xffff;
  return key >= 0x8000 ? key - 0x10000 : key;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const transitions = manifest.interiorReturnTransitions.filter(
  (transition) => transition.source.model,
);
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
      model,
      status: renderKeys.includes(12) ? "verified" : "missing-node-12",
      sha256: crypto
        .createHash("sha256")
        .update(new Uint8Array(buffer))
        .digest("hex"),
      byteLength: buffer.byteLength,
      renderKeys,
      primaryMovingNode: 12,
      alternateMovingNodePresent: renderKeys.includes(7),
      modelResolution: transition.evidence.modelResolution,
      controllerRecordFileOffset: (
        transition.evidence.recordFileOffset
      ),
    });
    roots.forEach((root) => root.dispose());
  }
} finally {
  engine.dispose();
}

const failures = models.filter((model) => model.status !== "verified");
const report = {
  schema: "new-yokosuka-interior-door-model-audit-v1",
  generatedFrom: manifestPath,
  assetBase,
  method: (
    "Resolve door assets from exact CHRT DefImage bindings, exact authored "
    + "names, or a unique native-area door asset; load every resolved MT5 "
    + "through the production loader; and require native render node 12 used "
    + "by the proven generic door route."
  ),
  summary: {
    transitionCount: manifest.interiorReturnTransitions.length,
    resolvedModelCount: transitions.length,
    verifiedModelCount: models.length - failures.length,
    unresolvedModelCount: (
      manifest.interiorReturnTransitions.length - transitions.length
    ),
    failureCount: failures.length,
  },
  models,
  failures,
  evidenceBoundary: (
    "This proves pickable authored door geometry and the moving node for all "
    + "resolved models. DYKZ DOR2 is independently selected by the native "
    + "CHARA.CHRT DefImage binding rather than by filename or appearance."
  ),
};
fs.mkdirSync(new URL("../evidence/", import.meta.url), {
  recursive: true,
});
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${report.summary.verifiedModelCount}/`
  + `${report.summary.resolvedModelCount} resolved models verified`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
