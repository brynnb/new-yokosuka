import { Matrix } from "@babylonjs/core";

const configuredMeshes = new WeakSet();

/** Keep layered, blended surfaces ordered inside a single character mesh. */
export function enableTransparentTriangleSorting(mesh) {
  if (configuredMeshes.has(mesh)) return;
  if (!mesh.material?.needAlphaBlendingForMesh(mesh)) return;
  // MT5 creates one mesh per material. Sorting across material submesh ranges
  // would associate triangles with the wrong material.
  if (mesh.subMeshes.length !== 1 || mesh.getTotalIndices() < 6) return;
  configuredMeshes.add(mesh);

  // Back/front passes partition triangles by winding, not distance, undoing
  // their depth order. A single two-sided pass retains the sorted order.
  mesh.material.separateCullingPass = false;
  const worldView = Matrix.Identity();
  let sourceIndices;
  let order;
  let depths;
  let output;
  mesh.onBeforeRenderObservable.add(() => {
    const scene = mesh.getScene();
    if (!scene.activeCamera || !mesh.material?.needAlphaBlendingForMesh(mesh)) return;
    const indices = mesh.getIndices();
    if (mesh.subMeshes.length !== 1 || indices.length < 6) return;
    if (indices !== sourceIndices || !mesh.geometry._indexBufferIsUpdatable) {
      // Keep CPU topology in authored order for picking and FACE ownership.
      // Babylon's updateIndices would otherwise replace it on its first
      // update of a static index buffer, even with gpuMemoryOnly=true.
      mesh.setIndices(indices, null, true, true);
      sourceIndices = mesh.getIndices();
      order = Uint32Array.from({ length: indices.length / 3 }, (_, i) => i);
      depths = new Float64Array(order.length);
      output = mesh.getTotalVertices() > 65535
        ? new Uint32Array(indices) : new Uint16Array(indices);
    }
    // Use the same bone influences as the GPU, including welded seams. Bind
    // positions alone give the wrong order after an actor turns or animates.
    const positions = mesh.getPositionData(true, true);
    mesh.getWorldMatrix().multiplyToRef(scene.activeCamera.getViewMatrix(), worldView);
    const matrix = worldView.m;
    const direction = scene.useRightHandedSystem ? -1 : 1;
    for (let triangle = 0; triangle < order.length; triangle += 1) {
      let depth = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = indices[triangle * 3 + corner] * 3;
        depth += positions[offset] * matrix[2]
          + positions[offset + 1] * matrix[6]
          + positions[offset + 2] * matrix[10];
      }
      depths[triangle] = depth * direction;
    }
    order.sort((a, b) => depths[b] - depths[a] || a - b);
    let changed = false;
    for (let triangle = 0; triangle < order.length; triangle += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = triangle * 3 + corner;
        const index = indices[order[triangle] * 3 + corner];
        if (output[offset] !== index) changed = true;
        output[offset] = index;
      }
    }
    // Only visible meshes run this callback; stable order needs no GPU upload.
    // Do not alter winding, vertices, UVs, alpha, or inspection triangle IDs.
    if (changed) mesh.updateIndices(output, undefined, true);
  });
}
