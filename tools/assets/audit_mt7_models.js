#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseMt7 } from "../../src/Mt7Parser.js";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out");
const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
const positional = args.filter((value, index) => (
  value !== "--out" && index !== outputIndex + 1
));
if (positional.length !== 1 || (outputIndex >= 0 && !output)) {
  console.error("Usage: node tools/assets/audit_mt7_models.js MODEL_DIRECTORY [--out report.json]");
  process.exit(2);
}

const root = path.resolve(positional[0]);
const names = fs.readdirSync(root).filter((name) => name.toUpperCase().endsWith(".MT7")).sort();
const signatures = {};
const warningReasons = {};
const unsupportedVertexTypes = {};
const files = [];
const summary = {
  fileCount: 0,
  failedFileCount: 0,
  completeFileCount: 0,
  nodeCount: 0,
  meshNodeCount: 0,
  multiMaterialMeshNodeCount: 0,
  materialGroupCount: 0,
  parsedMaterialGroupCount: 0,
  skippedMaterialGroupCount: 0,
  batchCount: 0,
  vertexRecordCount: 0,
  referencedVertexRecordCount: 0,
  triangleCount: 0,
  embeddedTextureCount: 0,
};

for (const name of names) {
  const source = path.join(root, name);
  try {
    const model = parseMt7(fs.readFileSync(source));
    const parsedMeshes = model.nodes.filter((node) => node.mesh);
    const batches = parsedMeshes.flatMap((node) => node.mesh.batches);
    const vertices = batches.flatMap((batch) => batch.vertices);
    const triangles = batches.reduce((total, batch) => (
      total + Math.max(0, batch.vertices.length - 2)
    ), 0);
    signatures[model.signature] = (signatures[model.signature] || 0) + 1;
    summary.fileCount += 1;
    summary.nodeCount += model.nodes.length;
    summary.meshNodeCount += parsedMeshes.length;
    summary.multiMaterialMeshNodeCount += parsedMeshes.filter(
      (node) => node.mesh.materialGroups.length > 1,
    ).length;
    summary.materialGroupCount += parsedMeshes.reduce(
      (total, node) => total + node.mesh.materialGroups.length,
      0,
    );
    summary.skippedMaterialGroupCount += model.warnings.length;
    summary.parsedMaterialGroupCount += parsedMeshes.reduce((total, node) => (
      total + node.mesh.materialGroups.filter((group) => !group.warning).length
    ), 0);
    summary.batchCount += batches.length;
    summary.vertexRecordCount += vertices.length;
    summary.referencedVertexRecordCount += vertices.filter((vertex) => vertex.referenced).length;
    summary.triangleCount += triangles;
    summary.embeddedTextureCount += model.embeddedTextures.length;
    if (model.warnings.length === 0) summary.completeFileCount += 1;
    for (const warning of model.warnings) {
      const unsupported = warning.message.match(/unsupported MT7 vertex type 0x([0-9a-f]+)/i);
      if (unsupported) {
        const rawType = Number.parseInt(unsupported[1], 16);
        const key = `0x${(rawType & 0x7f).toString(16).padStart(2, "0")}`;
        unsupportedVertexTypes[key] = (unsupportedVertexTypes[key] || 0) + 1;
      }
      const reason = warning.message
        .replace(/0x[0-9a-f]+/gi, "0x…")
        .replace(/\b\d+\b/g, "N");
      warningReasons[reason] = (warningReasons[reason] || 0) + 1;
    }
    files.push({
      filename: name,
      signature: model.signature,
      nodeCount: model.nodes.length,
      meshNodeCount: parsedMeshes.length,
      materialGroupCount: parsedMeshes.reduce(
        (total, node) => total + node.mesh.materialGroups.length,
        0,
      ),
      skippedMaterialGroupCount: model.warnings.length,
      batchCount: batches.length,
      triangleCount: triangles,
    });
  } catch (error) {
    summary.failedFileCount += 1;
    files.push({ filename: name, error: error.message });
  }
}

const report = {
  schema: "new-yokosuka-mt7-audit-v2",
  root,
  summary: {
    ...summary,
    parsedMaterialGroupPercent: Number((
      100 * summary.parsedMaterialGroupCount
      / Math.max(1, summary.materialGroupCount)
    ).toFixed(2)),
  },
  signatures,
  warningReasons,
  unsupportedVertexTypes,
  files,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  const destination = path.resolve(output);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  console.log(`Wrote ${destination}`);
}
console.log(JSON.stringify({
  summary: report.summary,
  signatures,
  warningReasons,
  unsupportedVertexTypes,
}, null, 2));
