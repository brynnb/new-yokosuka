#!/usr/bin/env node
// Audit the exact geometry controlled by D000's native operation-0x0098
// clock rules. Pass a directory containing S1_D000_MAPNN.MT5 files; the tool
// never infers a semantic label from proximity.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import nativeLayerStates from "../../play/data/native-map-layer-states.json" with {
  type: "json",
};

const ROOT = path.resolve(import.meta.dirname, "../..");
const inputDirectory = path.resolve(process.argv[2] || "");
const outputPath = path.resolve(
  process.argv[3]
  || path.join(ROOT, "tools/evidence/d000-map-layer-geometry.json"),
);
if (!fs.existsSync(inputDirectory)) {
  throw new Error(
    "Usage: node tools/worlds/audit_d000_map_layer_geometry.mjs "
    + "<directory-with-S1_D000_MAPNN.MT5> [output.json]",
  );
}

const placements = JSON.parse(fs.readFileSync(
  path.join(ROOT, "tools/evidence/d000-interaction-coverage.json"),
));
const doors = placements.placements.filter(
  (record) => record.staticDoorType !== null,
);

function roundedVector(vector) {
  return vector.asArray().map((value) => Number(value.toFixed(6)));
}

function nearestDoors(center) {
  return doors.map((door) => {
    const dx = center.x - door.position[0];
    const dz = center.z - door.position[2];
    return {
      placementIndex: door.index,
      model: door.model,
      nativePosition: door.position,
      horizontalDistance: Number(Math.hypot(dx, dz).toFixed(6)),
    };
  }).sort(
    (left, right) => left.horizontalDistance - right.horizontalDistance,
  ).slice(0, 3);
}

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const definition = nativeLayerStates.areas.D000;
const layers = [];
for (const layer of definition.controlledLayers) {
  const filename = `${definition.modelPrefix}_MAP${
    String(layer).padStart(2, "0")
  }.MT5`;
  const modelPath = path.join(inputDirectory, filename);
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Missing ${modelPath}`);
  }
  const bytes = fs.readFileSync(modelPath);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const loader = new Mt5Loader(scene);
  const roots = await loader.load(buffer, null);
  const components = [];
  for (const root of roots) {
    for (const mesh of [root, ...root.getDescendants(false)]) {
      if (
        typeof mesh.getBoundingInfo !== "function"
        || mesh.getTotalVertices() <= 0
      ) {
        continue;
      }
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo();
      const bounds = mesh.getBoundingInfo().boundingBox;
      components.push({
        meshName: mesh.name,
        vertexCount: mesh.getTotalVertices(),
        triangleCount: mesh.getTotalIndices() / 3,
        minimum: roundedVector(bounds.minimumWorld),
        maximum: roundedVector(bounds.maximumWorld),
        center: roundedVector(bounds.centerWorld),
        nearestStaticDoors: nearestDoors(bounds.centerWorld),
      });
    }
  }
  layers.push({
    layer,
    filename,
    byteLength: bytes.byteLength,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    componentCount: components.length,
    triangleCount: components.reduce(
      (sum, component) => sum + component.triangleCount,
      0,
    ),
    components,
  });
  for (const root of roots) root.dispose();
}
engine.dispose();

const report = {
  schema: "new-yokosuka-d000-map-layer-geometry-v1",
  generatedFrom: {
    nativeRules: "play/data/native-map-layer-states.json",
    placements: "tools/evidence/d000-interaction-coverage.json",
  },
  summary: {
    layerCount: layers.length,
    componentCount: layers.reduce(
      (sum, layer) => sum + layer.componentCount,
      0,
    ),
    triangleCount: layers.reduce(
      (sum, layer) => sum + layer.triangleCount,
      0,
    ),
  },
  layers,
  evidenceBoundary: (
    "Bounds and nearest-door distances are exact geometric joins. Proximity "
    + "is retained for inspection only and never names a store, assigns a "
    + "door, or supplies a scripted-state semantic."
  ),
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
