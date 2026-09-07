#!/usr/bin/env node

import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const ASSET_BASE = (
  "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue"
);

function pointKey(point) {
  return [point.x, point.y, point.z]
    .map((value) => Math.round(value * 1000))
    .join(",");
}

function triangleKey(points) {
  return points.map(pointKey).sort().join("|");
}

function triangleShapeKey(points) {
  const lengths = [
    BABYLON.Vector3.DistanceSquared(points[0], points[1]),
    BABYLON.Vector3.DistanceSquared(points[1], points[2]),
    BABYLON.Vector3.DistanceSquared(points[2], points[0]),
  ].map((value) => Math.round(value * 100000)).sort((a, b) => a - b);
  return lengths.join(",");
}

function renderMeshes(root) {
  return [root, ...root.getDescendants(false)].filter((mesh) => (
    typeof mesh.getTotalVertices === "function"
    && mesh.getTotalVertices() > 0
    && mesh.getIndices()
  ));
}

function meshTriangles(mesh) {
  const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  const matrix = mesh.computeWorldMatrix(true);
  const point = (vertexIndex) => BABYLON.Vector3.TransformCoordinates(
    BABYLON.Vector3.FromArray(positions, vertexIndex * 3),
    matrix,
  );
  const triangles = [];
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const points = [
      point(indices[index]),
      point(indices[index + 1]),
      point(indices[index + 2]),
    ];
    triangles.push({
      key: triangleKey(points),
      shapeKey: triangleShapeKey(points),
      points,
    });
  }
  return triangles;
}

async function load(scene, filename) {
  const response = await fetch(`${ASSET_BASE}/${filename}`);
  if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
  const roots = await new Mt5Loader(scene).load(
    await response.arrayBuffer(),
    null,
  );
  return roots;
}

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const [baseRoots, overlayRoots, houseDoorRoots, gateDoorRoots] = await Promise.all([
  load(scene, "S1_JHD0_MAP01.MT5"),
  load(scene, "S1_JHD0_MAP03.MT5"),
  load(scene, "S1_JHD0_DR15_016.MT5"),
  load(scene, "S1_JHD0_DR29_000.MT5"),
]);
const baseKeys = new Set(
  baseRoots.flatMap(renderMeshes).flatMap(meshTriangles).map(({ key }) => key),
);
const doorShapeKeys = Object.fromEntries([
  ["DR15_016", houseDoorRoots],
  ["DR29_000", gateDoorRoots],
].map(([name, roots]) => [
  name,
  new Set(
    roots.flatMap(renderMeshes).flatMap(meshTriangles)
      .map(({ shapeKey }) => shapeKey),
  ),
]));

const report = overlayRoots.flatMap(renderMeshes).map((mesh) => {
  const triangles = meshTriangles(mesh);
  const overlap = triangles.filter(({ key }) => baseKeys.has(key)).length;
  mesh.refreshBoundingInfo();
  const bounds = mesh.getBoundingInfo().boundingBox;
  let node = mesh;
  while (node && !node._mt5Node) node = node.parent;
  return {
    mesh: mesh.name,
    nodeAddress: node?._mt5Node?.addr ?? null,
    renderKey: node?._mt5Node
      ? ((node._mt5Node.flag << 16) >> 16)
      : null,
    triangles: triangles.length,
    overlap,
    overlapRatio: triangles.length ? overlap / triangles.length : 0,
    doorShapeMatches: Object.fromEntries(
      Object.entries(doorShapeKeys).map(([name, shapes]) => [
        name,
        triangles.filter(({ shapeKey }) => shapes.has(shapeKey)).length,
      ]),
    ),
    minimum: bounds.minimumWorld.asArray(),
    maximum: bounds.maximumWorld.asArray(),
  };
});

console.log(JSON.stringify(report, null, 2));
console.error(JSON.stringify({
  doorBounds: Object.fromEntries([
    ["DR15_016", houseDoorRoots],
    ["DR29_000", gateDoorRoots],
  ].map(([name, roots]) => {
    const bounds = roots[0].getHierarchyBoundingVectors(true);
    return [name, {
      minimum: bounds.min.asArray(),
      maximum: bounds.max.asArray(),
    }];
  })),
  nearbyBaseMeshes: baseRoots.flatMap(renderMeshes).map((mesh) => {
    mesh.refreshBoundingInfo();
    const bounds = mesh.getBoundingInfo().boundingBox;
    let node = mesh;
    while (node && !node._mt5Node) node = node.parent;
    return {
      mesh: mesh.name,
      nodeAddress: node?._mt5Node?.addr ?? null,
      minimum: bounds.minimumWorld.asArray(),
      maximum: bounds.maximumWorld.asArray(),
    };
  }).filter(({ minimum, maximum }) => (
    maximum[0] >= 0
    && minimum[0] <= 6
    && maximum[2] >= -3
    && minimum[2] <= 4
  )),
}, null, 2));
engine.dispose();
