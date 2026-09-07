#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { indexMt7TexturePack } from "../../src/Mt7Loader.js";
import { parseMt7 } from "../../src/Mt7Parser.js";
import { PvrDecoder } from "../../src/PvrDecoder.js";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out");
const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
const positional = args.filter((value, index) => (
  value !== "--out" && (outputIndex < 0 || index !== outputIndex + 1)
));
if (positional.length !== 1 || (outputIndex >= 0 && !output)) {
  console.error("Usage: node tools/assets/audit_mt7_textures.js STAGING_DIRECTORY [--out report.json]");
  process.exit(2);
}

const root = path.resolve(positional[0]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "models.json")));
const packCache = new Map();
const failures = [];
const polygonListTypes = {};
const samplerAddressModes = {};
const filterModes = {};
const summary = {
  modelCount: 0,
  parsedMeshInstanceCount: 0,
  boundMeshInstanceCount: 0,
  untexturedMeshInstanceCount: 0,
  missingMeshInstanceCount: 0,
  runtimeTextureMeshInstanceCount: 0,
  externalTextureCount: 0,
  decodedExternalTextureCount: 0,
  embeddedTextureCount: 0,
  decodedEmbeddedTextureCount: 0,
};

function packFor(filename) {
  if (!filename) return null;
  if (!packCache.has(filename)) {
    const source = path.join(root, "textures", filename);
    packCache.set(filename, indexMt7TexturePack(fs.readFileSync(source)));
  }
  return packCache.get(filename);
}

for (const record of manifest.models) {
  const modelPath = path.join(root, "models", record.filename);
  const bytes = fs.readFileSync(modelPath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const model = parseMt7(buffer);
  const pack = packFor(record.texturePack);
  const embeddedById = new Map(
    model.embeddedTextures.map((entry) => [entry.textureIdHex, entry]),
  );
  summary.modelCount += 1;

  for (const node of model.nodes) {
    if (!node.mesh) continue;
    for (const group of node.mesh.materialGroups) {
      summary.parsedMeshInstanceCount += 1;
      const listType = (group.polygonControl >>> 24) & 0x7;
      const clampV = Boolean(group.tsp & (1 << 15));
      const clampU = Boolean(group.tsp & (1 << 16));
      const flipV = Boolean(group.tsp & (1 << 17));
      const flipU = Boolean(group.tsp & (1 << 18));
      const address = (clamp, flip) => clamp ? "clamp" : flip ? "mirror" : "repeat";
      const addressKey = `${address(clampU, flipU)}/${address(clampV, flipV)}`;
      const filterMode = (group.tsp >>> 13) & 0x3;
      polygonListTypes[listType] = (polygonListTypes[listType] || 0) + 1;
      samplerAddressModes[addressKey] = (samplerAddressModes[addressKey] || 0) + 1;
      filterModes[filterMode] = (filterModes[filterMode] || 0) + 1;
      const textureIndex = group.textureIndex;
      const textureEntry = model.textures[textureIndex];
      const external = textureEntry
        ? pack?.entries.get(textureEntry.textureIdHex)
        : null;
      const embedded = textureEntry
        ? embeddedById.get(textureEntry.textureIdHex)
        : null;
      if (external || embedded) {
        summary.boundMeshInstanceCount += 1;
      } else if (group.runtimeTexture) {
        summary.runtimeTextureMeshInstanceCount += 1;
      } else if (textureIndex === 0xffffffff) {
        summary.untexturedMeshInstanceCount += 1;
      } else {
        summary.missingMeshInstanceCount += 1;
        failures.push({
          kind: "missing-binding",
          filename: record.filename,
          nodeOffset: node.offset,
          materialGroupOffset: group.offset,
          textureIndex,
        });
      }
    }
  }

  for (const entry of model.embeddedTextures) {
    summary.embeddedTextureCount += 1;
    try {
      new PvrDecoder(buffer, entry.byteOffset, entry.byteLength).decodePixels();
      summary.decodedEmbeddedTextureCount += 1;
    } catch (error) {
      failures.push({
        kind: "embedded-decode",
        filename: record.filename,
        textureIdHex: entry.textureIdHex,
        message: error.message,
      });
    }
  }
}

for (const [filename, pack] of packCache) {
  for (const entry of pack.ordered) {
    summary.externalTextureCount += 1;
    try {
      new PvrDecoder(pack.buffer, entry.offset, entry.length).decodePixels();
      summary.decodedExternalTextureCount += 1;
    } catch (error) {
      failures.push({
        kind: "external-decode",
        filename,
        textureIdHex: entry.textureIdHex,
        message: error.message,
      });
    }
  }
}

const report = {
  schema: "new-yokosuka-mt7-texture-audit-v3",
  root,
  summary: {
    ...summary,
    bindingPercent: Number((
      100 * summary.boundMeshInstanceCount
      / Math.max(1, summary.parsedMeshInstanceCount)
    ).toFixed(2)),
    accountedMeshPercent: Number((
      100 * (
        summary.boundMeshInstanceCount
        + summary.untexturedMeshInstanceCount
        + summary.runtimeTextureMeshInstanceCount
      )
      / Math.max(1, summary.parsedMeshInstanceCount)
    ).toFixed(2)),
  },
  polygonListTypes,
  samplerAddressModes,
  filterModes,
  failures,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  const destination = path.resolve(output);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  console.log(`Wrote ${destination}`);
}
console.log(JSON.stringify(report.summary, null, 2));
if (failures.length > 0) process.exitCode = 1;
