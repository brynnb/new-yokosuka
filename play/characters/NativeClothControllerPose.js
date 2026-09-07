import * as BABYLON from "@babylonjs/core";

function finiteMatrix(value) {
  return (
    value !== null
    && typeof value === "object"
    && value.length === 16
    && Array.from(value).every(Number.isFinite)
  );
}

export function nativeClothControllerMatricesByType(
  controllerFamily,
  controllerMatrices,
) {
  if (
    !Array.isArray(controllerFamily?.nodes)
    || !Array.isArray(controllerMatrices)
  ) return null;
  const result = new Map();
  for (const node of controllerFamily.nodes) {
    const matrix = controllerMatrices[node.index];
    if (finiteMatrix(matrix)) result.set(node.type, matrix);
  }
  return result;
}

export function nativeClothUniformWorldScale(matrix) {
  if (!(matrix instanceof BABYLON.Matrix)) {
    throw new TypeError("native cloth character space must be a matrix");
  }
  const scaling = BABYLON.Vector3.One();
  const rotation = BABYLON.Quaternion.Identity();
  const translation = BABYLON.Vector3.Zero();
  if (!matrix.decompose(scaling, rotation, translation)) {
    throw new Error("native cloth character space cannot be decomposed");
  }
  const magnitudes = [
    Math.abs(scaling.x),
    Math.abs(scaling.y),
    Math.abs(scaling.z),
  ];
  const minimum = Math.min(...magnitudes);
  const maximum = Math.max(...magnitudes);
  if (maximum - minimum > Math.max(1e-5, maximum * 1e-5)) {
    throw new Error("native cloth body presentation requires uniform actor scale");
  }
  return magnitudes.reduce((sum, value) => sum + value, 0) / 3;
}

export function nativeClothControllerWorldPosition(
  matricesByType,
  controllerType,
  characterSpaceMatrix,
  localOffset = null,
) {
  const controllerMatrix = matricesByType?.get(controllerType);
  if (!finiteMatrix(controllerMatrix)) return null;
  const point = localOffset
    ? BABYLON.Vector3.FromArray(localOffset)
    : BABYLON.Vector3.Zero();
  const rigPoint = BABYLON.Vector3.TransformCoordinates(
    point,
    BABYLON.Matrix.FromArray(controllerMatrix),
  );
  return BABYLON.Vector3.TransformCoordinates(
    rigPoint,
    characterSpaceMatrix,
  );
}
