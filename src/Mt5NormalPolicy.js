import { Material, VertexBuffer } from "@babylonjs/core";

// Choose a mesh's front side in bind space without rewriting authored strips
// or smoothed normals. Babylon handles negative world determinants at draw
// time; including the character's X reflection here would apply it twice.
export function mt5AuthoredSideOrientation(mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const indices = mesh.getIndices();
  if (!positions || !normals || !indices) {
    throw new Error(`MT5 surface ${mesh.name} orientation data is unavailable`);
  }
  let alignment = 0;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const first = indices[triangle] * 3;
    const second = indices[triangle + 1] * 3;
    const third = indices[triangle + 2] * 3;
    const a = [0, 1, 2].map(axis => positions[first + axis] - positions[second + axis]);
    const b = [0, 1, 2].map(axis => positions[third + axis] - positions[second + axis]);
    const windingNormal = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      alignment += windingNormal[axis] * (
        normals[first + axis] + normals[second + axis] + normals[third + axis]
      );
    }
  }
  // A wholly degenerate surface has no facing direction to infer.
  if (alignment === 0) return mesh.sideOrientation;
  const clockwise = (alignment < 0) !== mesh.getScene().useRightHandedSystem;
  // This is an absolute choice, not a toggle of the current orientation:
  // the loader and cloth preparation both apply this same rule.
  return clockwise ? Material.ClockWiseSideOrientation : Material.CounterClockWiseSideOrientation;
}

export function alignMt5CharacterSurfaceOrientations(modelRoot) {
  for (const mesh of modelRoot.getChildMeshes()) {
    if (!mesh.getTotalVertices() || !mesh.getTotalIndices()) continue;
    // Detailed attachments and explicitly configured source conventions
    // remain authoritative; do not override their material-level policy.
    if (mesh.material?.sideOrientation != null) continue;
    mesh.sideOrientation = mt5AuthoredSideOrientation(mesh);
  }
}

const EXPERIMENTAL_FLIPPED_NORMALS = Object.freeze({
  "S1_JHD0_MAP01.MT5": new Set([
    "mt5_tex_57",
    "mt5_tex_63",
  ]),
});

export function shouldFlipMt5Normals(sourceFilename, meshName) {
  return EXPERIMENTAL_FLIPPED_NORMALS[sourceFilename]?.has(meshName) === true;
}

export function applyMt5NormalPolicy(modelRoot, sourceFilename) {
  let flippedMeshes = 0;
  for (const mesh of modelRoot?.getDescendants?.(false) || []) {
    if (!shouldFlipMt5Normals(sourceFilename, mesh.name)) continue;
    const normals = mesh.getVerticesData?.("normal");
    if (!normals?.length) continue;

    mesh.setVerticesData(
      "normal",
      Array.from(normals, (value) => -value),
      false,
      3,
    );
    mesh.metadata = {
      ...(mesh.metadata || {}),
      experimentalFlippedNormals: true,
    };
    flippedMeshes++;
  }
  return flippedMeshes;
}
