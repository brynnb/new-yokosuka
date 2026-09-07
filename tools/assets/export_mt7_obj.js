#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { mt7BatchTriangleIndices, parseMt7 } from "../../src/Mt7Parser.js";

function usage() {
  console.error("Usage: node tools/assets/export_mt7_obj.js MODEL.MT7 [OUTPUT.obj] [--json]");
  process.exit(2);
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const positional = args.filter((value) => value !== "--json");
if (positional.length < 1 || positional.length > 2) usage();

const source = path.resolve(positional[0]);
const output = path.resolve(positional[1] || `${source}.obj`);
const bytes = fs.readFileSync(source);
const model = parseMt7(bytes);
const lines = [
  `# New Yokosuka Dreamcast MT7 export`,
  `# source ${source}`,
  `# signature ${model.signature}`,
];
let vertexBase = 1;
let exportedMeshes = 0;
let exportedTriangles = 0;

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(left, right) {
  const result = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[column * 4 + row] += left[inner * 4 + row] * right[column * 4 + inner];
      }
    }
  }
  return result;
}

function localMatrix(node) {
  const [sx, sy, sz] = node.scale;
  const [rx, ry, rz] = node.rotationRaw.map((value) => value * Math.PI * 2 / 65536);
  const [cx, sxr] = [Math.cos(rx), Math.sin(rx)];
  const [cy, syr] = [Math.cos(ry), Math.sin(ry)];
  const [cz, szr] = [Math.cos(rz), Math.sin(rz)];
  const scale = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const x = [1, 0, 0, 0, 0, cx, sxr, 0, 0, -sxr, cx, 0, 0, 0, 0, 1];
  const y = [cy, 0, -syr, 0, 0, 1, 0, 0, syr, 0, cy, 0, 0, 0, 0, 1];
  const z = [cz, szr, 0, 0, -szr, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const translation = identity();
  [translation[12], translation[13], translation[14]] = node.position;
  return multiply(translation, multiply(z, multiply(y, multiply(x, scale))));
}

function point(matrix, value, direction = false) {
  const w = direction ? 0 : 1;
  return [
    matrix[0] * value[0] + matrix[4] * value[1] + matrix[8] * value[2] + matrix[12] * w,
    matrix[1] * value[0] + matrix[5] * value[1] + matrix[9] * value[2] + matrix[13] * w,
    matrix[2] * value[0] + matrix[6] * value[1] + matrix[10] * value[2] + matrix[14] * w,
  ];
}

function normal(matrix, value) {
  const [a00, a01, a02] = [matrix[0], matrix[4], matrix[8]];
  const [a10, a11, a12] = [matrix[1], matrix[5], matrix[9]];
  const [a20, a21, a22] = [matrix[2], matrix[6], matrix[10]];
  const determinant = (
    a00 * (a11 * a22 - a12 * a21)
    - a01 * (a10 * a22 - a12 * a20)
    + a02 * (a10 * a21 - a11 * a20)
  );
  if (Math.abs(determinant) < 1e-12) return point(matrix, value, true);
  const inverse = [
    (a11 * a22 - a12 * a21) / determinant,
    (a02 * a21 - a01 * a22) / determinant,
    (a01 * a12 - a02 * a11) / determinant,
    (a12 * a20 - a10 * a22) / determinant,
    (a00 * a22 - a02 * a20) / determinant,
    (a02 * a10 - a00 * a12) / determinant,
    (a10 * a21 - a11 * a20) / determinant,
    (a01 * a20 - a00 * a21) / determinant,
    (a00 * a11 - a01 * a10) / determinant,
  ];
  return [
    inverse[0] * value[0] + inverse[3] * value[1] + inverse[6] * value[2],
    inverse[1] * value[0] + inverse[4] * value[1] + inverse[7] * value[2],
    inverse[2] * value[0] + inverse[5] * value[1] + inverse[8] * value[2],
  ];
}

const worldMatrices = new Map();
function assignWorld(node, parent = identity()) {
  if (!node) return;
  const world = multiply(parent, localMatrix(node));
  worldMatrices.set(node.offset, world);
  assignWorld(node.child, world);
  assignWorld(node.sibling, parent);
}
assignWorld(model.root);

for (const node of model.nodes) {
  if (!node.mesh) continue;
  const world = worldMatrices.get(node.offset) || identity();
  for (const [batchIndex, batch] of node.mesh.batches.entries()) {
    const name = `node_${node.offset.toString(16)}_batch_${batchIndex}`;
    lines.push(`o ${name}`);
    for (const vertex of batch.vertices) {
      const [x, y, z] = point(world, vertex.position);
      lines.push(`v ${x} ${y} ${z}`);
    }
    for (const vertex of batch.vertices) {
      const [u, v] = vertex.uv;
      lines.push(`vt ${u} ${v}`);
    }
    for (const vertex of batch.vertices) {
      const transformed = normal(world, vertex.normal);
      const length = Math.hypot(...transformed) || 1;
      lines.push(`vn ${transformed[0] / length} ${transformed[1] / length} ${transformed[2] / length}`);
    }
    const indices = mt7BatchTriangleIndices(batch);
    for (let index = 0; index < indices.length; index += 3) {
      const corners = indices.slice(index, index + 3).map((value) => value + vertexBase);
      lines.push(`f ${corners.map((value) => `${value}/${value}/${value}`).join(" ")}`);
      exportedTriangles += 1;
    }
    vertexBase += batch.vertices.length;
    exportedMeshes += 1;
  }
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join("\n")}\n`);
const report = {
  source,
  output,
  signature: model.signature,
  nodeCount: model.nodes.length,
  parsedMeshCount: model.nodes.filter((node) => node.mesh).length,
  skippedMeshCount: model.warnings.length,
  exportedBatchCount: exportedMeshes,
  exportedTriangleCount: exportedTriangles,
  warnings: model.warnings,
};
console.log(json ? JSON.stringify(report, null, 2) : (
  `Exported ${exportedMeshes} batches / ${exportedTriangles} triangles to ${output}`
));
