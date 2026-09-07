import * as BABYLON from "@babylonjs/core";
import {
  nativeCollisionAdjustmentForRecord,
} from "../config/nativeCollisionAdjustments.js";

const DEFAULT_LOWER_Y = -32;
const DEFAULT_UPPER_Y = 64;
const NATIVE_DOOR_CODE_MIN = 100;
const NATIVE_DOOR_CODE_MAX = 199;
export const NATIVE_STAIR_BOUNDARY_CODE = 10;
const DOOR_SEGMENT_MATCH_DISTANCE = 0.12;
const SEGMENT_EPSILON_SQUARED = 1e-10;
const SHENMUE2_TERRAIN_NORMAL_Y = 0.5;
// Keep this aligned with the controller's authored maxStepUp. FLDD models
// stair risers as individual vertical quads (usually about 0.225 units tall),
// but those quads describe the edge of a walkable step rather than a wall.
const SHENMUE2_MAX_STEP_RISER_HEIGHT = 0.32;
const SHENMUE2_STEP_RISER_EPSILON = 1e-5;
const SHENMUE2_SEGMENT_POINT_EPSILON = 1e-5;
const CIRCLE_TESSELLATION = 16;
const collisionAreaPromises = new Map();

function browserPoint([nativeX, nativeZ]) {
  return [-nativeX, -nativeZ];
}

export function nativeCollisionSegments(geometry) {
  if (geometry?.kind === "segment") {
    return [[browserPoint(geometry.start), browserPoint(geometry.end)]];
  }
  if (geometry?.kind === "circle") {
    const [centerX, centerZ] = browserPoint(geometry.center);
    const vertices = Array.from(
      { length: CIRCLE_TESSELLATION },
      (_, index) => {
        const angle = (index / CIRCLE_TESSELLATION) * Math.PI * 2;
        return [
          centerX + Math.cos(angle) * geometry.radius,
          centerZ + Math.sin(angle) * geometry.radius,
        ];
      },
    );
    return vertices.map((vertex, index) => [
      vertex,
      vertices[(index + 1) % vertices.length],
    ]);
  }

  let nativeVertices;
  if (geometry?.kind === "polyline" || geometry?.kind === "polygon") {
    nativeVertices = geometry.vertices;
  } else if (geometry?.kind === "parallelogram") {
    const { origin, edgeU, edgeV } = geometry;
    nativeVertices = [
      origin,
      [origin[0] + edgeU[0], origin[1] + edgeU[1]],
      [
        origin[0] + edgeU[0] + edgeV[0],
        origin[1] + edgeU[1] + edgeV[1],
      ],
      [origin[0] + edgeV[0], origin[1] + edgeV[1]],
    ];
  } else {
    return [];
  }
  const vertices = nativeVertices.map(browserPoint);
  const edgeCount = (
    geometry.kind === "polyline" ? vertices.length - 1 : vertices.length
  );
  return Array.from({ length: edgeCount }, (_, index) => [
    vertices[index],
    vertices[(index + 1) % vertices.length],
  ]);
}

function discForWorld(world) {
  const prefix = String(world?.prefix || "");
  const shenmue2Match = /^S2DC_D([1-4])_/i.exec(prefix);
  if (shenmue2Match) return shenmue2Match[1];
  const match = /^S([1-3])_/i.exec(prefix);
  return match?.[1] || null;
}

export function nativeCollisionDefinitionForWorld(
  world,
  areaDefinition,
) {
  const area = String(
    world?.collisionArea || world?.nativeArea || "",
  ).toUpperCase();
  if (!areaDefinition || areaDefinition.area !== area) return null;
  const requestedDisc = String(
    world?.collisionDisc || discForWorld(world) || "",
  );
  const variantId = (
    areaDefinition.discVariants?.[requestedDisc]
    || (!world?.requireNativeCollision && Object.values(areaDefinition.discVariants || {})[0])
  );
  const variant = areaDefinition.variants?.[variantId];
  if (!variant) return null;
  const fieldId = String(
    world?.nativeCollisionField || areaDefinition.defaultField || "0000",
  ).toUpperCase();
  const field = variant.fields.find(({ id }) => id === fieldId);
  if (!field) return null;
  return {
    area,
    disc: Number(requestedDisc) || variant.sources?.[0]?.disc || null,
    fieldId,
    variantId,
    source: variant.sources?.[0] || null,
    field,
  };
}

export async function parseNativeCollisionResponse(response, area) {
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Native collision data for ${area} failed: ${response.status}`,
    );
  }
  // Vite serves the application shell with status 200 for an unknown local
  // path. Native collision data is optional, so treat that HTML fallback like
  // a missing JSON file. Shenmue II MT7 worlds currently use their visual map
  // surfaces as the collision fallback.
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) return null;
  return response.json();
}

async function loadCollisionArea(area) {
  if (!collisionAreaPromises.has(area)) {
    const request = fetch(`/data/native-collisions/${area}.json`)
      .then((response) => parseNativeCollisionResponse(response, area))
      .catch((error) => {
        collisionAreaPromises.delete(area);
        throw error;
      });
    collisionAreaPromises.set(area, request);
  }
  return collisionAreaPromises.get(area);
}

export async function loadNativeCollisionDefinitionForWorld(world) {
  const area = String(
    world?.collisionArea || world?.nativeArea || "",
  ).toUpperCase();
  if (!area) return null;
  const areaDefinition = await loadCollisionArea(area);
  return nativeCollisionDefinitionForWorld(world, areaDefinition);
}

function appendSegmentWall(
  positions,
  indices,
  [start, end],
  lowerY,
  upperY,
) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  if (dx * dx + dz * dz <= SEGMENT_EPSILON_SQUARED) return false;
  const base = positions.length / 3;
  positions.push(
    start[0], lowerY, start[1],
    end[0], lowerY, end[1],
    end[0], upperY, end[1],
    start[0], upperY, start[1],
  );
  // Both windings are authored explicitly. Native COLI boundaries block
  // traversal from either side, independent of rendering back-face settings.
  indices.push(
    base, base + 1, base + 2,
    base, base + 2, base + 3,
    base + 2, base + 1, base,
    base + 3, base + 2, base,
  );
  return true;
}

function appendShenmue2Face(positions, indices, vertices, face) {
  const sourceIndices = face.slice(-4);
  while (
    sourceIndices.length > 3
    && sourceIndices.at(-1) === sourceIndices[0]
  ) {
    sourceIndices.pop();
  }
  const polygon = sourceIndices.filter((value, index) => (
    index === 0 || value !== sourceIndices[index - 1]
  ));
  if (new Set(polygon).size < 3) return false;
  const base = positions.length / 3;
  for (const index of polygon) {
    const point = vertices[index];
    if (!point) return false;
    // Shenmue II MT7 and FLDD use the same native world axes. Reflect X to
    // enter Babylon space, matching Mt7Loader and the authored warp records.
    positions.push(-point[0], point[1], point[2]);
  }
  for (let index = 1; index + 1 < polygon.length; index += 1) {
    indices.push(
      base, base + index, base + index + 1,
      base + index + 1, base + index, base,
    );
  }
  return true;
}

export function nativeCollisionBehaviorForCode(code) {
  return code === NATIVE_STAIR_BOUNDARY_CODE
    ? "stair-boundary"
    : "blocking";
}

export function nativeCollisionBehaviorBlocksPlayer(behavior) {
  return behavior === "blocking";
}

function shenmue2FacePoints(vertices, face) {
  return face.slice(-4).map((index) => vertices[index]).filter(Boolean);
}

function shenmue2FaceNormalY(vertices, face) {
  const points = shenmue2FacePoints(vertices, face);
  if (points.length < 3) return 0;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  for (const [index, current] of points.entries()) {
    const next = points[(index + 1) % points.length];
    normalX += (current[1] - next[1]) * (current[2] + next[2]);
    normalY += (current[2] - next[2]) * (current[0] + next[0]);
    normalZ += (current[0] - next[0]) * (current[1] + next[1]);
  }
  const length = Math.hypot(normalX, normalY, normalZ);
  return length > 0 ? normalY / length : 0;
}

function shenmue2FaceHeight(vertices, face) {
  const heights = shenmue2FacePoints(vertices, face)
    .map((point) => point[1]);
  if (heights.length < 3) return 0;
  return Math.max(...heights) - Math.min(...heights);
}

export function shenmue2CollisionBehaviorForFace(vertices, face) {
  const codeBehavior = nativeCollisionBehaviorForCode(Number(face?.[0]));
  if (codeBehavior === "stair-boundary") return codeBehavior;
  if (
    Math.abs(shenmue2FaceNormalY(vertices, face))
    >= SHENMUE2_TERRAIN_NORMAL_Y
  ) return "terrain-surface";
  const height = shenmue2FaceHeight(vertices, face);
  if (
    height > SHENMUE2_STEP_RISER_EPSILON
    && height <= SHENMUE2_MAX_STEP_RISER_HEIGHT
  ) return "step-riser";
  return "blocking";
}

function sameHorizontalPoint(left, right) {
  return (
    Math.abs(left[0] - right[0]) <= SHENMUE2_SEGMENT_POINT_EPSILON
    && Math.abs(left[1] - right[1]) <= SHENMUE2_SEGMENT_POINT_EPSILON
  );
}

function shenmue2BlockingSegment(vertices, face) {
  const points = shenmue2FacePoints(vertices, face);
  const horizontalPoints = [];
  for (const [nativeX, , nativeZ] of points) {
    const point = [-nativeX, nativeZ];
    if (!horizontalPoints.some((candidate) => (
      sameHorizontalPoint(candidate, point)
    ))) horizontalPoints.push(point);
  }
  if (horizontalPoints.length !== 2) return null;
  const heights = points.map((point) => point[1]);
  return {
    segment: horizontalPoints,
    yRange: [Math.min(...heights), Math.max(...heights)],
  };
}

function shenmue2FaceGroups(vertices, faces) {
  const groups = new Map();
  for (const [faceIndex, face] of (faces || []).entries()) {
    const nativeCode = Number(face[0]);
    const behavior = shenmue2CollisionBehaviorForFace(vertices, face);
    if (!groups.has(behavior)) {
      groups.set(behavior, {
        behavior,
        faces: [],
        faceIndices: [],
        nativeCodes: new Set(),
        segments: [],
        segmentYRanges: [],
        segmentFaceIndices: [],
      });
    }
    const group = groups.get(behavior);
    group.faces.push(face);
    group.faceIndices.push(faceIndex);
    if (Number.isInteger(nativeCode)) group.nativeCodes.add(nativeCode);
    if (behavior === "blocking") {
      const boundary = shenmue2BlockingSegment(vertices, face);
      if (boundary) {
        group.segments.push(boundary.segment);
        group.segmentYRanges.push(boundary.yRange);
        group.segmentFaceIndices.push(faceIndex);
      }
    }
  }
  return [...groups.values()];
}

function createShenmue2MeshCollision({
  scene,
  currentMeshes,
  definition,
}) {
  const meshes = [];
  for (const group of shenmue2FaceGroups(
    definition.field.vertices || [],
    definition.field.faces,
  )) {
    const positions = [];
    const indices = [];
    const includedFaceIndices = [];
    const includedFaceCodes = [];
    for (const [index, face] of group.faces.entries()) {
      if (appendShenmue2Face(
        positions,
        indices,
        definition.field.vertices || [],
        face,
      )) {
        includedFaceIndices.push(group.faceIndices[index]);
        includedFaceCodes.push(Number(face[0]));
      }
    }
    if (indices.length === 0) continue;
    const mesh = new BABYLON.Mesh(
      `native_fldd_${definition.area}_${definition.fieldId}_${group.behavior}`,
      scene,
    );
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh, false);
    mesh.visibility = 0;
    mesh.isPickable = false;
    mesh.checkCollisions = nativeCollisionBehaviorBlocksPlayer(group.behavior);
    mesh.metadata = {
      nativeCollision: true,
      nativeCollisionBehavior: group.behavior,
      nativeCollisionArea: definition.area,
      nativeCollisionDisc: definition.disc,
      nativeCollisionField: definition.fieldId,
      nativeCollisionCode: group.behavior === "stair-boundary"
        ? NATIVE_STAIR_BOUNDARY_CODE
        : null,
      nativeCollisionFaceCodes: [...group.nativeCodes].sort((a, b) => a - b),
      nativeCollisionFaceIndices: includedFaceIndices,
      nativeCollisionFaceNativeCodes: includedFaceCodes,
      nativeCollisionFaceCount: includedFaceIndices.length,
      nativeCollisionFacesOffset: definition.field.facesOffset ?? null,
      nativeCollisionSegments: group.segments,
      nativeCollisionSegmentYRanges: group.segmentYRanges,
      nativeCollisionSegmentFaceIndices: group.segmentFaceIndices,
      sourceModel: `${definition.area}/MAPINFO.BIN FLDD`,
      // Match S1: visual MAP geometry supplies walkable terrain height while
      // native collision supplies blocking semantics. Stair/elevation handoff
      // faces remain available to debugging without becoming physical walls.
      terrain: false,
      cameraBlocker: false,
    };
    currentMeshes.push(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

function collisionGroups(definition) {
  const groups = new Map();
  for (const [sectionIndex, section] of definition.field.sections.entries()) {
    for (const record of section.records) {
      const adjustment = nativeCollisionAdjustmentForRecord({
        area: definition.area,
        fieldId: definition.fieldId,
        sectionIndex,
        record,
      });
      if (adjustment?.action === "exclude") continue;
      const isDoorSegment = (
        record.code >= NATIVE_DOOR_CODE_MIN
        && record.code <= NATIVE_DOOR_CODE_MAX
        && record.geometry?.kind === "segment"
      );
      // A collision code is a behavior/classification, not a physical object
      // identifier. Several independent door leaves can therefore share one
      // code. Keep authored door segments independently transformable so
      // opening one leaf cannot remove every leaf carrying the same code.
      const key = isDoorSegment
        ? `${sectionIndex}:${record.code}:${record.recordOffset}`
        : `${sectionIndex}:${record.code}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sectionIndex,
          code: record.code,
          section,
          records: [],
        });
      }
      groups.get(key).records.push(record);
    }
  }
  return [...groups.values()];
}

function slidingDoorCollisionOffset(door) {
  if (
    door.type !== "sliding"
    && door.type !== "paired-sliding-panel"
  ) {
    return null;
  }
  const node = door.nodes?.[0];
  const bindPosition = door.collisionBindPositions?.[0];
  node?.computeWorldMatrix?.(true);
  const position = node?.getAbsolutePosition?.();
  if (!position || !bindPosition) return null;
  return position.subtract(bindPosition);
}

function pointSegmentDistanceSquared(point, [start, end]) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= SEGMENT_EPSILON_SQUARED) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const t = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * dx + (point[1] - start[1]) * dz
  ) / lengthSquared));
  const nearestX = start[0] + dx * t;
  const nearestZ = start[1] + dz * t;
  return (point[0] - nearestX) ** 2 + (point[1] - nearestZ) ** 2;
}

export function applyNativeDoorCollisionStates(meshes, doors = []) {
  for (const mesh of meshes || []) {
    if (!mesh?.metadata?.nativeCollision) continue;
    mesh.position.setAll(0);
    mesh.checkCollisions = nativeCollisionBehaviorBlocksPlayer(
      mesh.metadata.nativeCollisionBehavior,
    );
    mesh.metadata.nativeCollisionDoorOpen = false;
    mesh.metadata.nativeCollisionDoorMoved = false;
  }

  const openDoors = doors.filter(({ state }) => state !== "closed");
  const maximumDistanceSquared = DOOR_SEGMENT_MATCH_DISTANCE ** 2;
  for (const door of openDoors) {
    const position = door.root?.getAbsolutePosition?.();
    if (!position) continue;
    const point = [position.x, position.z];
    for (const mesh of meshes || []) {
      if (!mesh?.metadata?.nativeCollision) continue;
      const code = Number(mesh.metadata.nativeCollisionCode) || 0;
      if (code < NATIVE_DOOR_CODE_MIN || code > NATIVE_DOOR_CODE_MAX) {
        continue;
      }
      const matchesDoor = (
        mesh.metadata.nativeCollisionSegments || []
      ).some((segment) => (
        pointSegmentDistanceSquared(point, segment) <= maximumDistanceSquared
      ));
      if (!matchesDoor) continue;
      mesh.metadata.nativeCollisionDoorOpen = true;
      const offset = slidingDoorCollisionOffset(door);
      if (offset) {
        // Sliding leaves remain solid after opening: their authored native
        // boundary follows the panel into its stacked position. This opens
        // only the vacated half of a doorway and leaves the doubled-up half
        // blocked.
        mesh.position.copyFrom(offset);
        mesh.metadata.nativeCollisionDoorMoved = true;
      } else {
        mesh.checkCollisions = false;
      }
    }
  }
}

export function createNativeWorldCollision({
  scene,
  currentMeshes,
  definition,
  lowerY = DEFAULT_LOWER_Y,
  upperY = DEFAULT_UPPER_Y,
}) {
  if (!definition) return [];
  if (definition.field.kind === "mesh") {
    return createShenmue2MeshCollision({
      scene,
      currentMeshes,
      definition,
    });
  }
  const meshes = [];
  for (const group of collisionGroups(definition)) {
    const positions = [];
    const indices = [];
    const segments = [];
    const segmentRecordOffsets = [];
    for (const record of group.records) {
      for (const segment of nativeCollisionSegments(record.geometry)) {
        if (appendSegmentWall(positions, indices, segment, lowerY, upperY)) {
          segments.push(segment);
          segmentRecordOffsets.push(record.recordOffset);
        }
      }
    }
    if (indices.length === 0) continue;
    const mesh = new BABYLON.Mesh(
      `native_coli_${definition.area}_${definition.fieldId}_`
        + `${group.sectionIndex}_${group.code}`,
      scene,
    );
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh, false);
    mesh.isVisible = false;
    mesh.visibility = 0;
    mesh.isPickable = false;
    const behavior = nativeCollisionBehaviorForCode(group.code);
    mesh.checkCollisions = nativeCollisionBehaviorBlocksPlayer(behavior);
    mesh.metadata = {
      nativeCollision: true,
      nativeCollisionBehavior: behavior,
      nativeCollisionArea: definition.area,
      nativeCollisionDisc: definition.disc,
      nativeCollisionField: definition.fieldId,
      nativeCollisionSectionIndex: group.sectionIndex,
      nativeCollisionCode: group.code,
      nativeCollisionRecordOffsets: group.records.map(
        ({ recordOffset }) => recordOffset,
      ),
      nativeCollisionSegments: segments,
      nativeCollisionSegmentRecordOffsets: segmentRecordOffsets,
      sourceModel: `${definition.area}/MAPINFO.BIN COLS/COLI`,
      terrain: false,
      cameraBlocker: false,
    };
    currentMeshes.push(mesh);
    meshes.push(mesh);
  }
  applyNativeDoorCollisionStates(meshes);
  return meshes;
}
