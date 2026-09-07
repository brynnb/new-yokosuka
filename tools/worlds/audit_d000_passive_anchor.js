#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/d000-passive-anchor.json",
);
const captures = [0, 1, 2].map((entry) => {
  const source = `.disc-work/d000-entry${entry}-tagged-objects.json`;
  const report = JSON.parse(fs.readFileSync(source, "utf8"));
  return {
    source,
    entry,
    object: report.objects.find((object) => object.objectTag === "DAMY"),
  };
});
const transforms = JSON.parse(
  fs.readFileSync(".disc-work/d000-sh4-transforms.json", "utf8"),
);
const dispatch = JSON.parse(
  fs.readFileSync(".disc-work/d000-dispatch-calls.json", "utf8"),
);
const modelPath = path.resolve(
  ".disc-work/exact/d000/unpacked/OMG/SEGM4SPG.CHRM",
);
const bytes = fs.readFileSync(modelPath);
const modelBuffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const loader = new Mt5Loader(scene);
const roots = await loader.load(modelBuffer, null);
const root = roots[0];
root.computeWorldMatrix(true);
for (const node of root.getDescendants(false)) node.computeWorldMatrix?.(true);
const bounds = root.getHierarchyBoundingVectors(true);
const dimensions = [
  bounds.max.x - bounds.min.x,
  bounds.max.y - bounds.min.y,
  bounds.max.z - bounds.min.z,
];
const renderKeys = (root._mt5Nodes || []).map((node) => {
  const key = node.flag & 0xffff;
  return key >= 0x8000 ? key - 0x10000 : key;
});
const vertexCount = root.getDescendants(false).reduce(
  (total, node) => total + (node.getTotalVertices?.() || 0),
  0,
);
const directTransforms = (transforms.calls || []).filter(
  (call) => call.objectTag === "DAMY",
);
const directDispatch = dispatch.calls.filter(
  (call) => call.arguments.some((argument) => argument.ascii === "DAMY"),
).map((call) => ({
  callFileOffset: call.callFileOffset,
  operationHex: call.operationHex,
}));

const failures = [];
if (captures.some((capture) => !capture.object)) {
  failures.push("DAMY is absent from a runtime capture");
}
if (!captures.slice(0, 2).every(
  (capture) => capture.object.placementClass === "origin-or-inactive",
)) {
  failures.push("entries 0/1 do not classify DAMY as inactive");
}
if (captures[2]?.object?.placementClass !== "world") {
  failures.push("entry 2 does not contain DAMY's active anchor position");
}
if (dimensions.some((dimension) => dimension > 0.031)) {
  failures.push("SEGM4SPG exceeds the recovered 3 cm marker envelope");
}
if (renderKeys.length !== 1 || renderKeys[0] !== -1) {
  failures.push("SEGM4SPG unexpectedly has articulated child routes");
}
if (directTransforms.length !== 0) {
  failures.push("DAMY has direct authored HMDL transform calls");
}

const report = {
  schema: "new-yokosuka-d000-passive-anchor-v1",
  status: failures.length === 0 ? "verified" : "failed",
  source: {
    model: path.relative(process.cwd(), modelPath),
    captures: captures.map((capture) => capture.source),
    dispatch: ".disc-work/d000-dispatch-calls.json",
    transforms: ".disc-work/d000-sh4-transforms.json",
  },
  runtimeStates: captures.map((capture) => ({
    entry: capture.entry,
    placementClass: capture.object?.placementClass || null,
    runtimePosition: capture.object?.runtimePosition || null,
  })),
  model: {
    byteLength: bytes.length,
    vertexCount,
    renderKeys,
    dimensions,
  },
  directHmdlTransforms: directTransforms,
  directDispatch,
  classification: {
    browser: "non-rendered, non-interactive scene anchor",
    remainingGap: "native gameplay consumer of the anchor is not decoded",
  },
  failures,
};
engine.dispose();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${report.status})`);
if (failures.length > 0) process.exitCode = 1;
