import * as BABYLON from "@babylonjs/core";
import { isWorldMapFile } from "../WorldMapFiles.js";

export const STATIC_WORLD_BATCH_CELL_SIZE = 32;
const WORK_BUDGET_MS = 8;
const RENDER_PROPERTIES = [
  "sideOrientation", "alphaIndex", "renderingGroupId", "layerMask",
  "useVertexColors", "hasVertexAlpha", "isPickable", "checkCollisions",
  "receiveShadows", "applyFog", "visibility",
];
const SURFACE_PROPERTIES = ["authoredWater", "mt5DepthOverlay", "terrain", "cameraBlocker"];

function sourceRanges(meshes) {
  let firstFace = 0;
  let firstVertex = 0;
  return meshes.map(mesh => {
    const bounds = mesh.getBoundingInfo();
    const range = {
      firstFace, faceCount: mesh.getTotalIndices() / 3,
      firstVertex, vertexCount: mesh.getTotalVertices(),
      meshName: mesh.name, meshUniqueId: mesh.uniqueId,
      nodeAddress: mesh._mt5NodeAddress ?? null,
      ...(mesh.metadata?.sceneryPlacement ? {sceneryPlacement: mesh.metadata.sceneryPlacement} : {}),
      sourceModel: mesh.metadata?.sourceModel,
      originalFaceIds: mesh._mt5OriginalFaceIds
        ? Array.from(mesh._mt5OriginalFaceIds) : null,
      // Retain the original broad-phase test. Babylon permits a small epsilon
      // outside triangle edges, but each source mesh rejected rays outside its
      // own bounding box before testing triangles. A merged box is larger.
      pickingBounds: {
        inverseWorld: mesh.getWorldMatrix().clone().invert(),
        minimum: bounds.boundingBox.minimum.clone(),
        maximum: bounds.boundingBox.maximum.clone(),
        sphere: {
          center: bounds.boundingSphere.center.clone(),
          radius: bounds.boundingSphere.radius,
        },
      },
    };
    firstFace += range.faceCount;
    firstVertex += range.vertexCount;
    return range;
  });
}

/**
 * Pick each original surface separately while rendering the batch as one draw.
 * This preserves both the source broad-phase bounds and multiple overlapping
 * hits (needed when the nearest face is too steep to stand on).
 */
export function pickStaticBatchSources(mesh, worldRay, localRay, {
  fastCheck = false, trianglePredicate = null, world,
} = {}) {
  const sources = mesh.metadata?.staticBatchSources;
  if (!sources?.length) return null;
  const renderSubMeshes = mesh.subMeshes;
  const hits = [];
  try {
    for (const source of sources) {
      const bounds = source.pickingBounds;
      const sourceRay = BABYLON.Ray.Transform(worldRay, bounds.inverseWorld);
      if (!sourceRay.intersectsSphere(bounds.sphere)
        || !sourceRay.intersectsBoxMinMax(bounds.minimum, bounds.maximum)) continue;
      // A detached SubMesh restricts Babylon's triangle loop to this source.
      // Restore the one render SubMesh synchronously before the next frame.
      source.pickingSubMesh ??= new BABYLON.SubMesh(
        0, source.firstVertex, source.vertexCount,
        source.firstFace * 3, source.faceCount * 3,
        mesh, mesh, false, false,
      );
      mesh.subMeshes = [source.pickingSubMesh];
      const hit = mesh.intersects(localRay, fastCheck, trianglePredicate, false, world);
      if (hit?.hit) {
        hits.push(hit);
        if (fastCheck) break;
      }
    }
  } finally {
    mesh.subMeshes = renderSubMeshes;
  }
  return hits;
}

/** Recover authored face identity without retaining disposed source meshes. */
export function staticBatchSourceForFace(mesh, faceId) {
  if (!Number.isInteger(faceId) || faceId < 0) return null;
  const range = mesh.metadata?.staticBatchSources?.find(source => (
    faceId >= source.firstFace && faceId < source.firstFace + source.faceCount
  ));
  if (!range) return null;
  const localFace = faceId - range.firstFace;
  return {
    meshName: range.meshName, meshUniqueId: range.meshUniqueId,
    nodeAddress: range.nodeAddress,
    faceId: range.originalFaceIds?.[localFace] ?? localFace,
    ...(range.sceneryPlacement ? {sceneryPlacement: range.sceneryPlacement} : {}),
  };
}

function staticMetadata(source, count) {
  return {...source.metadata, staticWorldGeometry: true, staticBatchSourceMeshCount: count};
}

function mergedNormalsInRootSpace(meshes, root) {
  // Batches already share vertex layouts; unlit geometry may have no normals.
  if (!meshes[0].isVerticesDataPresent(BABYLON.VertexBuffer.NormalKind)
    || !meshes.some(mesh => mesh.nonUniformScaling)) return null;
  // MergeMeshes and bakeTransformIntoVertices use the position transform for
  // normals. Non-uniform authored scales need inverse-transpose instead, just
  // like Babylon's vertex shader. Preserve each vertex's world-space normal,
  // then undo the retained root's normal transform (transpose of its world).
  const normals = new Float32Array(meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices() * 3, 0));
  const rootTranspose = BABYLON.Matrix.Transpose(root.getWorldMatrix());
  const normal = BABYLON.Vector3.Zero();
  let offset = 0;
  for (const mesh of meshes) {
    const worldNormal = BABYLON.Matrix.Transpose(BABYLON.Matrix.Invert(mesh.getWorldMatrix()));
    const source = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    for (let index = 0; index < source.length; index += 3) {
      BABYLON.Vector3.TransformNormalFromFloatsToRef(source[index], source[index + 1], source[index + 2], worldNormal, normal);
      normal.normalize();
      BABYLON.Vector3.TransformNormalToRef(normal, rootTranspose, normal);
      normal.toArray(normals, offset);
      offset += 3;
    }
  }
  return normals;
}

/**
 * Shared MT5/MT7 primitive. Never crosses a model/layer root. MergeMeshes bakes
 * world transforms; convert back into the retained root's space before parenting
 * so its transform and visibility continue to own the entire layer.
 */
function* batchMapRoot(root, {
  cellSize = STATIC_WORLD_BATCH_CELL_SIZE,
  eligible = () => true,
  label = "world",
} = {}) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("Invalid batch cell size");
  const sources = root.getChildMeshes(false).filter(mesh => (
    mesh.getTotalVertices() > 0 && mesh.getTotalIndices() > 0
  ));
  root.computeWorldMatrix(true);
  const inverseRoot = BABYLON.Matrix.Invert(root.getWorldMatrix());
  const groups = new Map();
  let outputMeshCount = 0;
  for (const mesh of sources) {
    if (!eligible(mesh, root)) { outputMeshCount++; continue; }
    mesh.computeWorldMatrix(true);
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const key = [
      mesh.material?.uniqueId ?? "none",
      Math.floor(center.x / cellSize), Math.floor(center.z / cellSize),
      ...RENDER_PROPERTIES.map(key => mesh[key]),
      ...SURFACE_PROPERTIES.map(key => mesh.metadata?.[key]),
      mesh.getVerticesDataKinds().slice().sort().join(","),
    ].join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }

  let mergedSourceMeshCount = 0;
  let batchIndex = 0;
  for (const meshes of groups.values()) {
    if (meshes.length === 1) {
      meshes[0].metadata = staticMetadata(meshes[0], 1);
      meshes[0].freezeWorldMatrix();
      outputMeshCount++;
    } else {
      const source = meshes[0];
      const properties = Object.fromEntries(RENDER_PROPERTIES.map(key => [key, source[key]]));
      const metadata = {...staticMetadata(source, meshes.length), staticBatchSources: sourceRanges(meshes)};
      // A combined fixed-prop layer can contain several source models. The
      // per-face records above retain identity; no whole batch belongs to the
      // first prop merely because that happened to be its first surface.
      if (meshes.some(mesh => mesh.metadata?.sceneryPlacement)) {
        delete metadata.sceneryPlacement;
        delete metadata.sourceModel;
      }
      const normals = mergedNormalsInRootSpace(meshes, root);
      const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true);
      if (!merged) throw new Error("Compatible static world meshes could not be merged");
      merged.name = `${label}_static_${batchIndex++}`;
      if (!inverseRoot.isIdentity()) merged.bakeTransformIntoVertices(inverseRoot);
      if (normals) merged.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, false);
      merged.parent = root;
      Object.assign(merged, properties);
      merged.metadata = metadata;
      merged.freezeWorldMatrix();
      mergedSourceMeshCount += meshes.length;
      outputMeshCount++;
    }
    // The async world loader may yield/cancel between groups; the MT7 loader
    // keeps its existing synchronous transaction using this same primitive.
    yield;
  }
  const result = {inputMeshCount: sources.length, outputMeshCount, mergedSourceMeshCount};
  root.metadata = {
    ...root.metadata,
    staticBatchCellSize: cellSize,
    staticBatchInputMeshCount: sources.length,
    staticBatchOutputMeshCount: outputMeshCount,
    staticBatchMergedSourceMeshCount: mergedSourceMeshCount,
  };
  return result;
}

export function spatiallyBatchMt7MapRoot(root, options = {}) {
  const batches = batchMapRoot(root, {...options, label: "mt7"});
  let step;
  do { step = batches.next(); } while (!step.done);
  return step.value;
}

export function immutableMt5Mesh(mesh, root, {fixedPlacementRoots} = {}) {
  if (
    !mesh.material || mesh.material.getClassName() === "MultiMaterial"
    || mesh.material.needAlphaBlendingForMesh(mesh)
    || mesh.skeleton || mesh.morphTargetManager || mesh.isAnInstance
    // Correct scaled normals below, but leave tangent-frame/custom geometry
    // intact until its handedness and shader inputs have equivalent coverage.
    || (mesh.nonUniformScaling && (
      !mesh.isVerticesDataPresent(BABYLON.VertexBuffer.NormalKind)
      || mesh.isVerticesDataPresent(BABYLON.VertexBuffer.TangentKind)
    ))
    || !Number.isFinite(mesh.getWorldMatrix().determinant())
    || mesh.getWorldMatrix().determinant() === 0
    || mesh.instances?.length || mesh.hasThinInstances
    || mesh.subMeshes?.length !== 1 || mesh.visibility !== 1
    || !mesh.isVisible || mesh.billboardMode || mesh.infiniteDistance
    || mesh.onBeforeBindObservable.hasObservers()
    || mesh.onBeforeRenderObservable.hasObservers()
    || mesh.onAfterRenderObservable.hasObservers()
    || mesh.onAfterWorldMatrixUpdateObservable.hasObservers()
    || mesh.onDisposeObservable.hasObservers()
    || mesh.getVerticesDataKinds().some(kind => mesh.getVertexBuffer(kind)?.isUpdatable())
  ) return false;
  for (let node = mesh; node; node = node.parent) {
    const metadata = node.metadata;
    if (!node.isWorldMatrixFrozen || node.animations?.length || node.actionManager
      || (node._runtimePlacement && !fixedPlacementRoots?.has(node)) || node._scheduledSceneObject
      || metadata?.runtimeObject
      || metadata?.localEffect || metadata?.nativeAseqSceneObject
      || metadata?.arcadeSuppressedVariant
      || Object.keys(metadata || {}).some(key => key.startsWith("interactive"))) return false;
    // A whole layer can be inactive until night/winter. Disabled subtrees
    // inside it have a separate owner (for example AUTH geometry masks).
    if (node === root) return true;
    if (!node.isEnabled(false)) return false;
  }
  return false;
}

function yieldBatchWork() {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise(resolve => setTimeout(resolve, 0));
}

/** Explicit offline layer entry point. Gameplay never approves placed roots. */
export async function batchStaticSceneryLayer(root, {
  signal, yieldWork = yieldBatchWork, workBudgetMs = WORK_BUDGET_MS,
  cellSize = STATIC_WORLD_BATCH_CELL_SIZE, fixedPlacementRoots,
  workBudget = {checkpoint: performance.now()},
} = {}) {
  const batches = batchMapRoot(root, {
    eligible: (mesh, owner) => immutableMt5Mesh(mesh, owner, {fixedPlacementRoots}),
    label: "mt5", cellSize,
  });
  let step;
  do {
    signal?.throwIfAborted();
    step = batches.next();
    if (!step.done && performance.now() - workBudget.checkpoint >= workBudgetMs) {
      await yieldWork();
      signal?.throwIfAborted();
      workBudget.checkpoint = performance.now();
    }
  } while (!step.done);
  return step.value;
}

/**
 * Gameplay-only finalization, after surface edits/runtime ownership and before
 * building collision/render indices. Viewer inspection never calls this.
 * Transparent/custom-rendered surfaces, props, actors and owned subtrees keep
 * their original meshes, callbacks and ordering.
 */
export async function batchStaticWorldRoots(roots, {
  signal, yieldWork = yieldBatchWork, workBudgetMs = WORK_BUDGET_MS,
  cellSize = STATIC_WORLD_BATCH_CELL_SIZE,
} = {}) {
  const results = [];
  // Share the deadline across small layers too. Resetting it at every root can
  // turn many individually cheap layers into one long uninterruptible task.
  const workBudget = {checkpoint: performance.now()};
  for (const root of roots) {
    signal?.throwIfAborted();
    if (!isWorldMapFile(root._filename || "") || root._mt5CharacterRig
      || root._runtimePlacement || root._scheduledSceneObject
      || root.metadata?.staticBatchInputMeshCount !== undefined) continue;
    const result = await batchStaticSceneryLayer(root, {signal, yieldWork, workBudgetMs, cellSize, workBudget});
    results.push({filename: root._filename, ...result});
  }
  return results;
}
