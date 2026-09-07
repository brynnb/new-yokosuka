#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  discoverNativeClothGroups,
} from "../../play/characters/NativeClothModel.js";
import {
  nativeClothCharacterProfile,
} from "../../play/characters/NativeClothProfiles.js";
import {
  buildNativeClothTopology,
} from "../../play/characters/NativeClothTopology.js";

const CHARACTER_DIRECTORY = "play/assets/characters";
const OUTPUT_FILE = "tools/evidence/shenmue1-native-cloth-models.json";
const WEB_OUTPUT_FILE = "play/data/native-cloth-models.web.js";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function arrayBuffer(value) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  );
}

function triangleCount(node) {
  return (node?.model?.polygons || []).reduce(
    (total, polygon) => total + (polygon.strips || []).reduce(
      (stripTotal, strip) => stripTotal + Math.max(0, strip.length - 2),
      0,
    ),
    0,
  );
}

function sourceVertexBytes(bytes, node) {
  const start = Number(node?.model?.vertexAddr);
  const count = Number(node?.model?.nbVertex);
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(count)
    || start < 0
    || count < 0
    || start + count * 24 > bytes.byteLength
  ) {
    throw new Error("native cloth vertex source is outside its CHRM");
  }
  return bytes.subarray(start, start + count * 24);
}

function sourcePositionBytes(vertexBytes) {
  const positions = Buffer.allocUnsafe((vertexBytes.byteLength / 24) * 12);
  for (
    let sourceOffset = 0, targetOffset = 0;
    sourceOffset < vertexBytes.byteLength;
    sourceOffset += 24, targetOffset += 12
  ) {
    vertexBytes.copy(
      positions,
      targetOffset,
      sourceOffset,
      sourceOffset + 12,
    );
  }
  return positions;
}

function sourcePositions(vertexBytes) {
  const view = new DataView(
    vertexBytes.buffer,
    vertexBytes.byteOffset,
    vertexBytes.byteLength,
  );
  return Array.from({ length: vertexBytes.byteLength / 24 }, (_, index) => [
    view.getFloat32(index * 24, true),
    view.getFloat32(index * 24 + 4, true),
    view.getFloat32(index * 24 + 8, true),
  ]);
}

function address(value) {
  return value === null || value === undefined
    ? null
    : `0x${Number(value).toString(16)}`;
}

async function buildInventory() {
  const filenames = fs.readdirSync(CHARACTER_DIRECTORY)
    .filter(filename => filename.endsWith(".CHRM"))
    .sort();
  const engine = new BABYLON.NullEngine({
    renderWidth: 1,
    renderHeight: 1,
  });
  const models = [];
  try {
    for (const filename of filenames) {
      const bytes = fs.readFileSync(path.join(CHARACTER_DIRECTORY, filename));
      const scene = new BABYLON.Scene(engine);
      try {
        const [root] = await new Mt5Loader(scene, {
          characterRigMode: "gpu",
        }).load(arrayBuffer(bytes), null, { sourceFilename: filename });
        const groups = discoverNativeClothGroups(root);
        if (groups.length === 0) continue;
        const profile = nativeClothCharacterProfile(filename);
        models.push({
          modelFile: filename,
          modelCode: path.basename(filename, ".CHRM"),
          byteLength: bytes.byteLength,
          sha256: sha256(bytes),
          groups: groups.map(group => {
            const controlBytes = sourceVertexBytes(bytes, group.controlNode);
            const renderBytes = group.renderNode
              ? sourceVertexBytes(bytes, group.renderNode)
              : null;
            const controlPositions = sourcePositionBytes(controlBytes);
            const renderPositions = renderBytes
              ? sourcePositionBytes(renderBytes)
              : null;
            const topology = buildNativeClothTopology({
              controlPositions: sourcePositions(controlBytes),
              renderPositions: renderBytes
                ? sourcePositions(renderBytes)
                : null,
              rawControlBytes: profile.rawControlBytes,
              controlType: group.controlType,
            });
            return {
              controlType: group.controlType,
              renderType: group.renderType,
              controlNodeAddress: address(group.controlNode.addr),
              renderNodeAddress: address(group.renderNode?.addr),
              vertexCount: group.vertexCount,
              triangleCount: triangleCount(group.controlNode),
              hasRenderSurface: group.hasRenderSurface,
              controlRestVertexSha256: sha256(controlBytes),
              renderRestVertexSha256: renderBytes
                ? sha256(renderBytes)
                : null,
              controlRestPositionSha256: sha256(controlPositions),
              renderRestPositionSha256: renderPositions
                ? sha256(renderPositions)
                : null,
              renderRestPositionsMatchControl: renderPositions
                ? controlPositions.equals(renderPositions)
                : null,
              topology: {
                rowCount: topology.rowCount,
                columnCount: topology.columnCount,
                closedColumns: topology.closedColumns,
                sourceVertexOrder: topology.sourceVertexOrder,
                anchorBindings: topology.anchorBindings,
                anchorSelectors: topology.anchorSelectors,
                collisionMask: topology.collisionMask,
                latticeToRenderVertexMap:
                  topology.latticeToRenderVertexMap,
              },
            };
          }),
        });
      } finally {
        scene.dispose();
      }
    }
  } finally {
    engine.dispose();
  }

  const groups = models.flatMap(model => model.groups);
  const groupCountByControlType = Object.fromEntries(
    [...new Set(groups.map(group => group.controlType))]
      .sort((left, right) => left - right)
      .map(type => [
        type,
        groups.filter(group => group.controlType === type).length,
      ]),
  );
  return {
    schema: "new-yokosuka-shenmue1-native-cloth-model-inventory-v2",
    generatedFrom: {
      characterDirectory: CHARACTER_DIRECTORY,
      modelFormat: "HRCM/MT5 CHRM",
    },
    evidenceBoundary: [
      "Negative CLTH control-node types and their positive output-node mapping come from Shenmue I FUN_0c0ae100/FUN_0c0ae220.",
      "Geometry counts and hashes come from the exact bundled CHRM files; this inventory contains metadata and does not duplicate model assets.",
      "Lattice order, seam closure, anchors, collision masks, and render mapping are generated by the shared native topology implementation validated against live CLTH memory.",
      "Control-only groups are preserved because the native constructor also permits an absent paired output node.",
    ],
    summary: {
      characterModelCount: filenames.length,
      clothModelCount: models.length,
      clothGroupCount: groups.length,
      renderedGroupCount: groups.filter(group => group.hasRenderSurface).length,
      controlOnlyGroupCount: groups.filter(group => !group.hasRenderSurface).length,
      matchingRestPositionGroupCount: groups.filter(
        group => group.renderRestPositionsMatchControl === true,
      ).length,
      distinctRestPositionGroupCount: groups.filter(
        group => group.renderRestPositionsMatchControl === false,
      ).length,
      groupCountByControlType,
    },
    models,
  };
}

const inventory = await buildInventory();
const serialized = `${JSON.stringify(inventory, null, 2)}\n`;
const webModels = Object.fromEntries(inventory.models.map(model => [
  model.modelCode,
  model.groups.map(group => ({
    controlType: group.controlType,
    renderType: group.renderType,
    vertexCount: group.vertexCount,
    hasRenderSurface: group.hasRenderSurface,
    ...group.topology,
  })),
]));
const webSerialized = `// Generated by tools/animation/build_native_cloth_model_inventory.mjs.\n`
  + `// Topology metadata only; original model vertices remain in CHRM assets.\n\n`
  + `function deepFreeze(value) {\n`
  + `  if (!value || typeof value !== "object" || Object.isFrozen(value)) {\n`
  + `    return value;\n`
  + `  }\n`
  + `  Object.freeze(value);\n`
  + `  for (const child of Object.values(value)) deepFreeze(child);\n`
  + `  return value;\n`
  + `}\n\n`
  + `export const NATIVE_CLOTH_MODEL_METADATA = deepFreeze(`
  + `${JSON.stringify(webModels, null, 2)}\n);\n`;
if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUTPUT_FILE)
    ? fs.readFileSync(OUTPUT_FILE, "utf8")
    : "";
  if (current !== serialized) {
    console.error(`${OUTPUT_FILE} is stale; regenerate the native cloth inventory.`);
    process.exitCode = 1;
  }
  const currentWeb = fs.existsSync(WEB_OUTPUT_FILE)
    ? fs.readFileSync(WEB_OUTPUT_FILE, "utf8")
    : "";
  if (currentWeb !== webSerialized) {
    console.error(`${WEB_OUTPUT_FILE} is stale; regenerate native cloth metadata.`);
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(OUTPUT_FILE, serialized);
  fs.writeFileSync(WEB_OUTPUT_FILE, webSerialized);
  console.log(
    `Wrote ${inventory.summary.clothGroupCount} cloth groups across `
    + `${inventory.summary.clothModelCount} models to ${OUTPUT_FILE}`,
  );
}
