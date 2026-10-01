import { TransparentTriangleSortWorkspace } from "./TransparentTriangleSortWorkspace.js";

const configuredMeshes = new WeakSet();
const modes = new Set(["optimized", "legacy", "off"]);
const parameters = new URLSearchParams(globalThis.location?.search || "");
let mode = modes.has(parameters.get("transparentSort"))
  ? parameters.get("transparentSort") : "optimized";
let diagnosticsEnabled = parameters.get("transparentSortDebug") === "1";
const statistics = {
  callbacks: 0,
  passes: 0,
  bypassedPasses: 0,
  positionReads: 0,
  triangles: 0,
  vertexDepthCalculations: 0,
  fullSortCalls: 0,
  repairPasses: 0,
  skippedSorts: 0,
  uploads: 0,
  cpuMilliseconds: 0,
};

/** Changes only this module's triangle sorter; no animation/rendering is paused. */
export function setTransparentTriangleSortMode(next) {
  if (!modes.has(next)) throw new TypeError(`Unknown transparent sort mode: ${next}`);
  mode = next;
  resetTransparentTriangleSortStatistics();
  return mode;
}

export function resetTransparentTriangleSortStatistics() {
  for (const key of Object.keys(statistics)) statistics[key] = 0;
}

export function getTransparentTriangleSortStatistics() {
  return { mode, diagnosticsEnabled, ...statistics };
}

export function setTransparentTriangleSortDiagnostics(enabled) {
  diagnosticsEnabled = Boolean(enabled);
  resetTransparentTriangleSortStatistics();
}

// Opt-in diagnostics only: no new global in ordinary gameplay, no per-mesh
// references, and no timing/statistics updates unless explicitly enabled.
if (diagnosticsEnabled && typeof window !== "undefined") {
  globalThis.__newYokosukaTransparentSort = Object.freeze({
    setMode: setTransparentTriangleSortMode,
    reset: resetTransparentTriangleSortStatistics,
    stats: getTransparentTriangleSortStatistics,
    setDiagnostics: setTransparentTriangleSortDiagnostics,
  });
}

/** Keep layered, blended surfaces ordered inside a single character mesh. */
export function enableTransparentTriangleSorting(mesh) {
  if (configuredMeshes.has(mesh)) return;
  if (!mesh.material?.needAlphaBlendingForMesh(mesh)) return;
  // MT5 creates one mesh per material. Never cross material submesh ranges.
  if (mesh.subMeshes.length !== 1 || mesh.getTotalIndices() < 6) return;
  configuredMeshes.add(mesh);

  // Keep the original single two-sided pass and all authored opacity/winding.
  mesh.material.separateCullingPass = false;
  let worldView;
  let sourceIndices;
  let sourceGeometry;
  let workspace;
  mesh.onBeforeRenderObservable.add(() => {
    const record = diagnosticsEnabled;
    if (record) statistics.callbacks += 1;
    const scene = mesh.getScene();
    if (!scene.activeCamera || !mesh.material?.needAlphaBlendingForMesh(mesh)) return;
    if (mode === "off") {
      if (record) statistics.bypassedPasses += 1;
      return; // Diagnostic only: leaves the most recent GPU triangle order.
    }
    const indices = mesh.getIndices();
    const vertexCount = mesh.getTotalVertices();
    if (mesh.subMeshes.length !== 1 || !indices || indices.length < 6
      || indices.length % 3 !== 0 || !mesh.geometry) return;
    const started = record ? performance.now() : 0;
    try {
      if (indices !== sourceIndices || mesh.geometry !== sourceGeometry
        || !mesh.geometry._indexBufferIsUpdatable
        || workspace?.vertexCount !== vertexCount
        || workspace?.indexCount !== indices.length) {
        // Preserve CPU topology and the current SubMesh for picking and FACE.
        // Same contract as before: GPU-only subsequent updates require an
        // updatable index buffer and must not replace authored triangle IDs.
        mesh.setIndices(indices, null, true, true);
        sourceIndices = mesh.getIndices();
        sourceGeometry = mesh.geometry;
        workspace = new TransparentTriangleSortWorkspace(sourceIndices, vertexCount);
      }
      // Deliberately unchanged: Babylon applies current bones, morphs and any
      // updated CPU positions. No stale cross-frame pose cache is introduced.
      const positions = mesh.getPositionData(true, true);
      if (record) statistics.positionReads += 1;
      if (!positions || positions.length < vertexCount * 3) return;
      const world = mesh.getWorldMatrix();
      // A real Babylon Matrix with the engine's own precision/configuration.
      // Allocate once, lazily; the sorter needs no additional Babylon import.
      worldView ||= world.clone();
      world.multiplyToRef(scene.activeCamera.getViewMatrix(), worldView);
      const changed = workspace.sort(
        positions, sourceIndices, worldView.m,
        scene.useRightHandedSystem, mode === "optimized",
      );
      if (changed) mesh.updateIndices(workspace.output, undefined, true);
      if (record) {
        statistics.passes += 1;
        statistics.triangles += workspace.order.length;
        statistics.vertexDepthCalculations += workspace.vertexDepthCalculations;
        statistics.fullSortCalls += workspace.didFullSort ? 1 : 0;
        statistics.repairPasses += workspace.didSort && !workspace.didFullSort ? 1 : 0;
        statistics.skippedSorts += workspace.didSort ? 0 : 1;
        statistics.uploads += changed ? 1 : 0;
      }
    } finally {
      if (record) statistics.cpuMilliseconds += performance.now() - started;
    }
  });
}
