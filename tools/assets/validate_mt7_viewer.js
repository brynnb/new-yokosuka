#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as BABYLON from "@babylonjs/core";
import {
  indexMt7TexturePack,
  Mt7Loader,
  resolveMt7TextureEntry,
} from "../../src/Mt7Loader.js";
import { parseMt7 } from "../../src/Mt7Parser.js";

if (process.argv.length !== 3) {
  console.error("Usage: node tools/assets/validate_mt7_viewer.js STAGING_DIRECTORY");
  process.exit(2);
}

const root = path.resolve(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "models.json")));
const categories = ["MAPM", "PROP", "CHRM", "MT7"];
const packCache = new Map();

function packFor(filename) {
  if (!filename) return null;
  if (!packCache.has(filename)) {
    packCache.set(filename, indexMt7TexturePack(
      fs.readFileSync(path.join(root, "textures", filename)),
    ));
  }
  return packCache.get(filename);
}

function inspect(record) {
  const bytes = fs.readFileSync(path.join(root, "models", record.filename));
  const model = parseMt7(bytes);
  const pack = packFor(record.texturePack);
  const embeddedById = new Map(
    model.embeddedTextures.map((entry) => [entry.textureIdHex, entry]),
  );
  const meshNodes = model.nodes.filter((node) => node.mesh);
  const fullyBound = meshNodes.every((node) => (
    node.mesh.materialGroups.every((group) => {
      const entry = model.textures[group.textureIndex];
      return Boolean(
        (entry && pack?.entries.get(entry.textureIdHex))
        || (entry && embeddedById.get(entry.textureIdHex))
      );
    })
  ));
  return { bytes, model, meshNodes, fullyBound };
}

const representatives = categories.map((kind) => {
  for (const record of manifest.models) {
    if (record.kind !== kind) continue;
    const inspected = inspect(record);
    if (
      inspected.meshNodes.length > 0
      && inspected.model.warnings.length === 0
      && inspected.fullyBound
    ) return { record, ...inspected };
  }
  throw new Error(`No complete, textured ${kind} representative found`);
});

const bindingRegressions = [
  { suffix: "_AKA3_MPK00_MAP.MT7", minimumTextureIds: 10 },
  { suffix: "_MFW0_BOX02996.MT7", minimumTextureIds: 1 },
  { suffix: "_MFW0_HATO2MNT.MT7", minimumTextureIds: 1 },
  { suffix: "_MFW0_RYO_M.MT7", minimumTextureIds: 9 },
].map(({ suffix, minimumTextureIds }) => {
  const record = manifest.models.find((entry) => entry.filename.endsWith(suffix));
  assert.ok(record, `missing binding regression model ${suffix}`);
  const { model, meshNodes } = inspect(record);
  const pack = packFor(record.texturePack);
  const embeddedById = new Map(
    model.embeddedTextures.map((entry) => [entry.textureIdHex, entry]),
  );
  const textureIds = new Set();
  for (const node of meshNodes) {
    for (const group of node.mesh.materialGroups) {
      const resolved = resolveMt7TextureEntry(
        model,
        pack,
        embeddedById,
        group.textureIndex,
      );
      if (resolved.textureEntry) {
        assert.ok(
          resolved.packed || resolved.embedded,
          `${record.filename}: unresolved ${resolved.textureEntry.textureIdHex}`,
        );
        textureIds.add(resolved.textureEntry.textureIdHex);
      }
    }
  }
  assert.ok(
    textureIds.size >= minimumTextureIds,
    `${record.filename}: resolved only ${textureIds.size} distinct texture IDs`,
  );
  return { filename: record.filename, distinctTextureIdCount: textureIds.size };
});

assert.notEqual(
  [...new Set(bindingRegressions.slice(1, 3).map((entry) => {
    const record = manifest.models.find((item) => item.filename === entry.filename);
    return parseMt7(fs.readFileSync(path.join(root, "models", record.filename)))
      .textures[0]?.textureIdHex;
  }))].length,
  1,
  "MFW0 box and pigeon unexpectedly resolve to the same texture ID",
);

const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
const scene = new BABYLON.Scene(engine);
const loader = new Mt7Loader(scene);
const results = [];

for (const representative of representatives) {
  const { record, bytes, model, meshNodes } = representative;
  const packBytes = record.texturePack
    ? fs.readFileSync(path.join(root, "textures", record.texturePack))
    : null;
  const roots = loader.load(bytes, packBytes, { sourceFilename: record.filename });
  const meshes = roots[0].getChildMeshes();
  const expectedBatchCount = meshNodes.reduce(
    (total, node) => total + node.mesh.batches.length,
    0,
  );
  assert.equal(meshes.length, expectedBatchCount, `${record.filename}: mesh count`);
  assert.ok(meshes.length > 0, `${record.filename}: no meshes`);
  for (const mesh of meshes) {
    assert.ok(mesh.material?.diffuseTexture, `${mesh.name}: missing decoded texture`);
    for (const kind of [
      BABYLON.VertexBuffer.PositionKind,
      BABYLON.VertexBuffer.NormalKind,
      BABYLON.VertexBuffer.UVKind,
    ]) {
      const values = mesh.getVerticesData(kind);
      assert.ok(values?.length > 0, `${mesh.name}: missing ${kind}`);
      assert.ok(values.every(Number.isFinite), `${mesh.name}: non-finite ${kind}`);
    }
    mesh.computeWorldMatrix(true);
    assert.ok(
      mesh.getWorldMatrix().asArray().every(Number.isFinite),
      `${mesh.name}: non-finite world transform`,
    );
  }
  results.push({
    kind: record.kind,
    filename: record.filename,
    texturePack: record.texturePack,
    nodeCount: model.nodes.length,
    meshCount: meshes.length,
    textureMaterialCount: new Set(meshes.map((mesh) => mesh.material)).size,
  });
  roots[0].dispose();
  loader.clearCaches();
}

scene.dispose();
engine.dispose();
console.log(JSON.stringify({
  schema: "new-yokosuka-mt7-viewer-validation-v2",
  bindingRegressions,
  results,
}, null, 2));
