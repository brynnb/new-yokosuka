#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  auditRuntimePlacementRoots,
  summarizeRuntimePlacementAudit,
} from "../../src/RuntimePlacementAudit.js";

const args = process.argv.slice(2);
const manifestPath = path.resolve(
  args.shift() || "play/data/jomo-runtime-placements.json",
);
let outputPath = "";
let assetBase = (
  "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue"
);
while (args.length > 0) {
  const argument = args.shift();
  if (argument === "--out") outputPath = path.resolve(args.shift());
  else if (argument === "--asset-base") assetBase = args.shift();
  else {
    console.error(`Unknown argument: ${argument}`);
    process.exit(2);
  }
}

async function fetchModel(placement) {
  if (placement.assetFile) {
    const file = path.resolve(
      path.dirname(manifestPath),
      "../assets/dobuita",
      placement.assetFile,
    );
    const bytes = fs.readFileSync(file);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }
  const { model } = placement;
  if (/^https?:\/\//i.test(assetBase)) {
    const response = await fetch(
      `${assetBase.replace(/\/$/, "")}/${model}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  }
  const bytes = fs.readFileSync(path.join(path.resolve(assetBase), model));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const modelBuffers = new Map();
const records = [];

for (const placement of manifest.placements) {
  try {
    const modelBufferKey = placement.assetFile || placement.model;
    let modelBuffer = modelBuffers.get(modelBufferKey);
    if (!modelBuffer) {
      modelBuffer = await fetchModel(placement);
      modelBuffers.set(modelBufferKey, modelBuffer);
    }
    const loader = new Mt5Loader(scene);
    const roots = await loader.load(modelBuffer.slice(0), null);
    for (const root of roots) {
      root.position.set(...placement.position);
      if (placement.rotationDegrees) {
        root.rotation.set(
          ...placement.rotationDegrees.map(BABYLON.Tools.ToRadians),
        );
      }
      if (placement.scale) root.scaling.set(...placement.scale);
    }
    records.push(...auditRuntimePlacementRoots(placement, roots));
    roots.forEach((root) => root.dispose());
  } catch (error) {
    records.push({
      placementId: placement.id ?? null,
      model: placement.model,
      objectTag: placement.runtime?.objectTag ?? null,
      rootIndex: null,
      vertexCount: 0,
      renderableMeshCount: 0,
      visibleMeshCount: 0,
      expectedPosition: placement.position ?? null,
      actualPosition: null,
      worldBounds: null,
      failures: [
        `load-error: ${error instanceof Error ? error.message : String(error)}`,
      ],
      status: "failed",
    });
  }
}

const report = {
  schema: "new-yokosuka-runtime-placement-instance-audit-v1",
  source: {
    manifest: path.relative(process.cwd(), manifestPath),
    assetBase,
  },
  summary: summarizeRuntimePlacementAudit(manifest.placements, records),
  records,
};
engine.dispose();

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
}
process.stdout.write(serialized);
if (report.summary.status !== "verified") process.exitCode = 1;
