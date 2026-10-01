import * as BABYLON from "@babylonjs/core";
import "@babylonjs/core/Culling/Octrees/octreeSceneComponent.js";
import { pickStaticBatchSources } from "./StaticWorldBatching.js";

export const WORLD_RAYCAST_CELL_SIZE = 16;
const MAX_MESH_CELLS = 256;
const indexesByScene = new WeakMap();

/** Transfer resident geometry to a moving owner, before or after world indexing. */
export function markWorldMeshDynamic(mesh) {
  mesh.unfreezeWorldMatrix?.();
  mesh.metadata = { ...mesh.metadata, dynamicWorldGeometry: true };
  indexesByScene.get(mesh.getScene?.())?.makeDynamic(mesh);
}

function cellCoordinate(value, cellSize) {
  return Math.floor(value / cellSize);
}

function cellKey(x, z) {
  return `${x}:${z}`;
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
    const batchHits = pickStaticBatchSources(mesh, ray, localRay, {
      fastCheck, trianglePredicate, world,
    });
    const meshHits = batchHits ?? [mesh.intersects(
      localRay, fastCheck, trianglePredicate, false, world,
    )];
    for (const hit of meshHits) {
      if (!hit?.hit) continue;
      hit.ray = ray;
      if (multi) {
        hits.push(hit);
      } else if (!nearest || hit.distance < nearest.distance) {
        nearest = hit;
        if (fastCheck) return nearest;
      }
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
    indexesByScene.set(scene, this);
  }

  makeDynamic(mesh) {
    if (this.staticMeshes.delete(mesh)) {
      // Resident props can become AUTH-owned after the world was indexed.
      // Unfreezing their matrices alone leaves their old cells in the octree.
      this.selectionOctree?.removeMesh(mesh);
      this.globalMeshes = this.globalMeshes.filter(candidate => candidate !== mesh);
      for (const [key, meshes] of this.cells) {
        const retained = meshes.filter(candidate => candidate !== mesh);
        if (retained.length) this.cells.set(key, retained);
        else this.cells.delete(key);
      }
    }
    this.#addDynamicMesh(mesh);
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
    if (indexesByScene.get(this.scene) === this) indexesByScene.delete(this.scene);
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
    && mesh.metadata?.dynamicWorldGeometry !== true
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
