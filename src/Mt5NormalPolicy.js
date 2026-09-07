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
