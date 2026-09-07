import * as BABYLON from "@babylonjs/core";
import "@babylonjs/core/Culling/Octrees/octreeSceneComponent.js";

export const MT7_STATIC_BATCH_CELL_SIZE = 32;
export const WORLD_RAYCAST_CELL_SIZE = 16;
const MAX_MESH_CELLS = 256;

function cellCoordinate(value, cellSize) {
  return Math.floor(value / cellSize);
}

function cellKey(x, z) {
  return `${x}:${z}`;
}

function meshVertexSignature(mesh) {
  return mesh.getVerticesDataKinds().slice().sort().join(",");
}

function copyStaticMetadata(source, sourceMeshCount) {
  return {
    ...(source.metadata || {}),
    staticWorldGeometry: true,
    staticBatchSourceMeshCount: sourceMeshCount,
  };
}

/**
 * MT7 MAP files contain thousands of tiny triangle-strip batches. They are
 * static in playable worlds, so combine compatible batches within spatial
 * cells while retaining material boundaries and useful local culling.
 */
export function spatiallyBatchMt7MapRoot(root, {
  cellSize = MT7_STATIC_BATCH_CELL_SIZE,
} = {}) {
  const sourceMeshes = root.getChildMeshes(false).filter((mesh) => (
    mesh.getTotalVertices?.() > 0
  ));
  root.computeWorldMatrix(true);
  const groups = new Map();
  for (const mesh of sourceMeshes) {
    mesh.computeWorldMatrix(true);
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const key = [
      mesh.material?.uniqueId ?? "none",
      cellCoordinate(center.x, cellSize),
      cellCoordinate(center.z, cellSize),
      mesh.sideOrientation,
      mesh.alphaIndex,
      mesh.useVertexColors ? 1 : 0,
      mesh.hasVertexAlpha ? 1 : 0,
      mesh.metadata?.authoredWater ? 1 : 0,
      meshVertexSignature(mesh),
    ].join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }

  let mergedSourceMeshCount = 0;
  let outputMeshCount = 0;
  let batchIndex = 0;
  for (const meshes of groups.values()) {
    if (meshes.length === 1) {
      meshes[0].metadata = copyStaticMetadata(meshes[0], 1);
      meshes[0].freezeWorldMatrix();
      outputMeshCount += 1;
      continue;
    }
    const source = meshes[0];
    const sourceState = {
      alphaIndex: source.alphaIndex,
      useVertexColors: source.useVertexColors,
      hasVertexAlpha: source.hasVertexAlpha,
      isPickable: source.isPickable,
      metadata: { ...(source.metadata || {}) },
    };
    const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true);
    if (!merged) {
      for (const mesh of meshes) {
        mesh.metadata = copyStaticMetadata(mesh, 1);
      }
      outputMeshCount += meshes.length;
      continue;
    }
    merged.name = `mt7_static_${batchIndex}`;
    batchIndex += 1;
    merged.parent = root;
    merged.alphaIndex = sourceState.alphaIndex;
    merged.useVertexColors = sourceState.useVertexColors;
    merged.hasVertexAlpha = sourceState.hasVertexAlpha;
    merged.isPickable = sourceState.isPickable;
    merged.metadata = {
      ...sourceState.metadata,
      staticWorldGeometry: true,
      staticBatchSourceMeshCount: meshes.length,
    };
    merged.freezeWorldMatrix();
    mergedSourceMeshCount += meshes.length;
    outputMeshCount += 1;
  }
  root.metadata = {
    ...(root.metadata || {}),
    staticBatchCellSize: cellSize,
    staticBatchInputMeshCount: sourceMeshes.length,
    staticBatchOutputMeshCount: outputMeshCount,
    staticBatchMergedSourceMeshCount: mergedSourceMeshCount,
  };
  return {
    inputMeshCount: sourceMeshes.length,
    outputMeshCount,
    mergedSourceMeshCount,
  };
}

/** Pick from an already spatially-filtered mesh collection. */
export function pickMeshesWithRay(
  meshes,
  ray,
  predicate,
  { multi = false, fastCheck = false, trianglePredicate = null } = {},
) {
  const hits = [];
  let nearest = null;
  const inverse = BABYLON.Matrix.Identity();
  const localRay = BABYLON.Ray.Zero();
  for (const mesh of meshes || []) {
    if (predicate) {
      if (!predicate(mesh, -1)) continue;
    } else if (!mesh.isEnabled() || !mesh.isVisible || !mesh.isPickable) {
      continue;
    }
    const world = mesh.computeWorldMatrix();
    world.invertToRef(inverse);
    BABYLON.Ray.TransformToRef(ray, inverse, localRay);
    const hit = mesh.intersects(
      localRay,
      fastCheck,
      trianglePredicate,
      false,
      world,
    );
    if (!hit?.hit) continue;
    hit.ray = ray;
    if (multi) {
      hits.push(hit);
    } else if (!nearest || hit.distance < nearest.distance) {
      nearest = hit;
      if (fastCheck) return nearest;
    }
  }
  if (multi) return hits;
  return nearest || new BABYLON.PickingInfo();
}

export class WorldRaycastIndex {
  constructor(scene, staticMeshes, {
    cellSize = WORLD_RAYCAST_CELL_SIZE,
    accelerateRendering = false,
    renderOctreeCapacity = 64,
    renderOctreeDepth = 3,
  } = {}) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.cells = new Map();
    this.globalMeshes = [];
    this.cellCandidateCache = new Map();
    this.staticMeshes = new Set(staticMeshes || []);
    // Runtime props, doors, actors, and vehicles remain a small linear set.
    // Keeping them outside the spatial grid means their bounds may move at
    // any time without making the static index stale.
    this.dynamicMeshes = new Set(scene.meshes.filter((mesh) => (
      !this.staticMeshes.has(mesh)
      && mesh.getTotalVertices?.() > 0
    )));
    this.selectionOctree = null;
    this.newMeshObserver = scene.onNewMeshAddedObservable.add((mesh) => {
      this.#addDynamicMesh(mesh);
    });
    this.removedMeshObserver = scene.onMeshRemovedObservable.add((mesh) => {
      this.#removeMesh(mesh);
    });
    for (const mesh of this.staticMeshes) this.#insert(mesh);
    if (accelerateRendering) {
      this.#installRenderSelection(renderOctreeCapacity, renderOctreeDepth);
    }
  }

  #addDynamicMesh(mesh) {
    // Babylon announces a mesh as soon as it is added to the scene, before
    // MeshBuilder/importers necessarily attach vertex data. Register it now;
    // the normal pick predicates will ignore non-renderable helper meshes.
    // The notification is deferred, so a helper may already have been
    // removed by the time this callback runs (for example, clustered
    // lighting's render-target-only ProxyMesh). Never put such stale meshes
    // back into the selection octree's render candidates.
    if (this.staticMeshes.has(mesh) || !this.scene.meshes.includes(mesh)) return;
    this.dynamicMeshes.add(mesh);
    this.cellCandidateCache.clear();
    if (
      this.selectionOctree
      && !this.selectionOctree.dynamicContent.includes(mesh)
    ) {
      this.selectionOctree.dynamicContent.push(mesh);
    }
  }

  #removeMesh(mesh) {
    this.dynamicMeshes.delete(mesh);
    this.staticMeshes.delete(mesh);
    this.cellCandidateCache.clear();
    if (this.selectionOctree) {
      this.selectionOctree.removeMesh(mesh);
      const dynamicIndex = this.selectionOctree.dynamicContent.indexOf(mesh);
      if (dynamicIndex >= 0) {
        this.selectionOctree.dynamicContent.splice(dynamicIndex, 1);
      }
    }
  }

  #installRenderSelection(maxCapacity, maxDepth) {
    if (this.staticMeshes.size === 0) return;
    const octree = this.scene.createOrUpdateSelectionOctree(
      maxCapacity,
      maxDepth,
    );
    const minimum = new BABYLON.Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const maximum = new BABYLON.Vector3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    for (const mesh of this.staticMeshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      minimum.minimizeInPlace(bounds.minimumWorld);
      maximum.maximizeInPlace(bounds.maximumWorld);
    }
    octree.update(minimum, maximum, [...this.staticMeshes]);
    octree.dynamicContent = [...this.dynamicMeshes];
    this.selectionOctree = octree;
  }

  #insert(mesh) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const minX = cellCoordinate(bounds.minimumWorld.x, this.cellSize);
    const maxX = cellCoordinate(bounds.maximumWorld.x, this.cellSize);
    const minZ = cellCoordinate(bounds.minimumWorld.z, this.cellSize);
    const maxZ = cellCoordinate(bounds.maximumWorld.z, this.cellSize);
    const cellCount = (maxX - minX + 1) * (maxZ - minZ + 1);
    if (cellCount > MAX_MESH_CELLS) {
      this.globalMeshes.push(mesh);
      return;
    }
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = cellKey(x, z);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(mesh);
      }
    }
  }

  candidatesForRay(ray) {
    const finiteLength = Number.isFinite(ray.length) ? ray.length : 1000;
    const end = ray.origin.add(ray.direction.scale(finiteLength));
    const minX = cellCoordinate(Math.min(ray.origin.x, end.x), this.cellSize);
    const maxX = cellCoordinate(Math.max(ray.origin.x, end.x), this.cellSize);
    const minZ = cellCoordinate(Math.min(ray.origin.z, end.z), this.cellSize);
    const maxZ = cellCoordinate(Math.max(ray.origin.z, end.z), this.cellSize);
    if (minX === maxX && minZ === maxZ) {
      const key = cellKey(minX, minZ);
      if (!this.cellCandidateCache.has(key)) {
        this.cellCandidateCache.set(key, [
          ...new Set([
            ...this.globalMeshes,
            ...(this.cells.get(key) || []),
            ...this.dynamicMeshes,
          ]),
        ]);
      }
      return this.cellCandidateCache.get(key);
    }
    const candidates = new Set(this.globalMeshes);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (const mesh of this.cells.get(cellKey(x, z)) || []) {
          candidates.add(mesh);
        }
      }
    }
    for (const mesh of this.dynamicMeshes) candidates.add(mesh);
    return [...candidates];
  }

  pickWithRay(ray, predicate, fastCheck = false, trianglePredicate = null) {
    return pickMeshesWithRay(this.candidatesForRay(ray), ray, predicate, {
      fastCheck,
      trianglePredicate,
    });
  }

  multiPickWithRay(ray, predicate, trianglePredicate = null) {
    return pickMeshesWithRay(this.candidatesForRay(ray), ray, predicate, {
      multi: true,
      trianglePredicate,
    });
  }

  dispose() {
    if (this.newMeshObserver) {
      this.scene.onNewMeshAddedObservable.remove(this.newMeshObserver);
      this.newMeshObserver = null;
    }
    if (this.removedMeshObserver) {
      this.scene.onMeshRemovedObservable.remove(this.removedMeshObserver);
      this.removedMeshObserver = null;
    }
    if (this.scene._selectionOctree === this.selectionOctree) {
      this.scene._selectionOctree = null;
    }
    this.selectionOctree = null;
    this.cells.clear();
    this.globalMeshes.length = 0;
    this.cellCandidateCache.clear();
    this.staticMeshes.clear();
    this.dynamicMeshes.clear();
  }
}

export function collectStaticWorldMeshes(currentMeshes) {
  return currentMeshes.flatMap((root) => (
    [root, ...root.getDescendants(false)]
  )).filter((mesh) => (
    mesh.isWorldMatrixFrozen === true
    && mesh.getTotalVertices?.() > 0
  ));
}

export function createWorldSpatialIndex(scene, currentMeshes) {
  const staticMeshes = collectStaticWorldMeshes(currentMeshes);
  return staticMeshes.length > 0
    ? new WorldRaycastIndex(scene, staticMeshes, {
      accelerateRendering: true,
    })
    : null;
}
