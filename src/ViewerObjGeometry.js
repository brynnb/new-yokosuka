import { Material } from "@babylonjs/core/Materials/material.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

function drawableParts(mesh) {
  const indices = (mesh.sourceMesh ?? mesh).isUnIndexed ? null : mesh.getIndices();
  const result = [];
  for (const part of mesh.subMeshes || []) {
    const count = indices ? part.indexCount : part.verticesCount;
    if (!count) continue;
    const material = mesh.material?.subMaterials
      ? mesh.material.subMaterials[part.materialIndex] ?? null
      : mesh.material ?? null;
    result.push({material, start: indices ? part.indexStart : part.verticesStart, count});
  }
  return result;
}

function sourceFile(mesh) {
  for (let node = mesh; node; node = node.parent) {
    if (node._filename) return node._filename;
  }
  return "";
}

// Files finish loading in parallel. Keep names stable between two visits to
// the same scene, retaining the loader's native mesh order within each file.
function orderedGeometry(meshes) {
  return [...new Set(meshes)].filter(mesh => mesh.getTotalVertices() > 0)
    .map(mesh => ({mesh, source: sourceFile(mesh), parts: drawableParts(mesh)}))
    .filter(entry => entry.parts.length)
    .sort((left, right) => left.source < right.source ? -1 : left.source > right.source ? 1 : 0);
}

function registerMaterials(entries) {
  const ids = new Map();
  for (const {parts} of entries) {
    for (const {material} of parts) {
      if (!ids.has(material)) ids.set(material, "material_" + String(ids.size + 1).padStart(4, "0"));
    }
  }
  return ids;
}

export function collectViewerObjMaterials(meshes) {
  return registerMaterials(orderedGeometry(meshes));
}

function faceVertex(index, offsets, hasUV, hasNormal) {
  const position = offsets.position + index;
  if (hasNormal) {
    const uv = hasUV ? offsets.uv + index : "";
    return `${position}/${uv}/${offsets.normal + index}`;
  }
  return hasUV ? `${position}/${offsets.uv + index}` : String(position);
}

function appendPrimitives(lines, mode, indices, start, count, flip, refs, firstVertex) {
  const index = i => indices ? indices[start + i] : start + i;
  const triangle = (a, b, c) => {
    if (a === b || a === c || b === c) return;
    lines.push(`f ${refs[a]} ${refs[flip ? c : b]} ${refs[flip ? b : c]}`);
  };
  switch (mode) {
    case Material.PointListDrawMode:
    case Material.PointFillMode:
      for (let i = 0; i < count; i++) lines.push("p " + (firstVertex + index(i)));
      return;
    case Material.LineListDrawMode:
      for (let i = 0; i + 1 < count; i += 2) {
        lines.push(`l ${firstVertex + index(i)} ${firstVertex + index(i + 1)}`);
      }
      return;
    case Material.LineLoopDrawMode:
    case Material.LineStripDrawMode: {
      const vertices = Array.from({length: count}, (_, i) => firstVertex + index(i));
      if (mode === Material.LineLoopDrawMode) vertices.push(vertices[0]);
      if (vertices.length >= 2) lines.push("l " + vertices.join(" "));
      return;
    }
    case Material.TriangleStripDrawMode:
      for (let i = 0; i + 2 < count; i++) {
        triangle(index(i + i % 2), index(i + 1 - i % 2), index(i + 2));
      }
      return;
    case Material.TriangleFanDrawMode:
      for (let i = 1; i + 1 < count; i++) triangle(index(0), index(i), index(i + 1));
      return;
    default:
      for (let i = 0; i + 2 < count; i += 3) triangle(index(i), index(i + 1), index(i + 2));
  }
}

// Write world-space copies. Babylon's OBJ globalposition option temporarily
// bakes the transforms into shared geometry, which can alter other live meshes.
export function createViewerObjGeometry(meshes, baseName, {materials = true} = {}) {
  const entries = orderedGeometry(meshes);
  const ids = materials ? registerMaterials(entries) : new Map();
  if (!entries.length) throw new Error("No exportable geometry found");
  const chunks = materials ? [`mtllib ${baseName}.mtl\n`] : [];
  const offsets = {position: 1, uv: 1, normal: 1};
  const point = Vector3.Zero();

  for (const [objectIndex, {mesh, source, parts}] of entries.entries()) {
    const positions = mesh.getVerticesData("position");
    if (!positions?.length) continue;
    const count = positions.length / 3;
    const uvs = mesh.getVerticesData("uv");
    const normals = mesh.getVerticesData("normal");
    const colors = mesh.getVerticesData("color");
    const colorStride = colors?.length / count;
    const sourceMesh = mesh.sourceMesh ?? mesh;
    const hasColors = sourceMesh.useVertexColors && (colorStride === 3 || colorStride === 4);
    const world = mesh.computeWorldMatrix(true);
    const determinant = world.determinant();
    const hasUV = uvs?.length === count * 2;
    const hasNormal = normals?.length === count * 3 && determinant !== 0;
    const normalTransform = hasNormal ? Matrix.Transpose(Matrix.Invert(world)) : null;
    const xSign = mesh.getScene().useRightHandedSystem ? 1 : -1;
    const name = [source, mesh.name, objectIndex + 1].filter(Boolean).join("_").replace(/[^\w.-]+/g, "_");
    const lines = ["o " + name];
    const refs = new Array(count);

    for (let i = 0; i < count; i++) {
      const v = i * 3;
      Vector3.TransformCoordinatesFromFloatsToRef(positions[v], positions[v + 1], positions[v + 2], world, point);
      let vertex = `v ${point.x * xSign} ${point.y} ${point.z}`;
      if (hasColors) {
        const c = i * colorStride;
        // Blender recognizes the widely supported XYZ RGB vertex extension.
        vertex += ` ${colors[c]} ${colors[c + 1]} ${colors[c + 2]}`;
      }
      lines.push(vertex);
      if (hasUV) lines.push(`vt ${uvs[2 * i]} ${uvs[2 * i + 1]}`);
      if (hasNormal) {
        Vector3.TransformNormalFromFloatsToRef(normals[v], normals[v + 1], normals[v + 2], normalTransform, point);
        point.normalize();
        lines.push(`vn ${point.x * xSign} ${point.y} ${point.z}`);
      }
      refs[i] = faceVertex(i, offsets, hasUV, hasNormal);
    }

    const indices = (mesh.sourceMesh ?? mesh).isUnIndexed ? null : mesh.getIndices();
    for (const {material, start, count: indexCount} of parts) {
      if (materials) lines.push("usemtl " + ids.get(material));
      // Match Babylon's glTF CCW conversion, then account for flattening a
      // reflected instance into world-space positions (no node scale in OBJ).
      const side = material?.sideOrientation ?? sourceMesh.sideOrientation;
      const flip = (side === Material.ClockWiseSideOrientation) !== (determinant < 0);
      const mode = sourceMesh.getClassName() === "LinesMesh"
        ? Material.LineListDrawMode : sourceMesh.overrideRenderingFillMode ?? material?.fillMode;
      appendPrimitives(lines, mode, indices, start, indexCount, flip, refs, offsets.position);
    }
    offsets.position += count;
    if (hasUV) offsets.uv += count;
    if (hasNormal) offsets.normal += count;
    chunks.push(lines.join("\n") + "\n");
  }
  return {obj: chunks.join(""), materials: ids};
}
