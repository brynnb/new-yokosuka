import * as BABYLON from "@babylonjs/core";

export function rowIdentity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function rowMultiply(left, right) {
  const result = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[row * 4 + col] += (
          left[row * 4 + index] * right[index * 4 + col]
        );
      }
    }
  }
  return result;
}

export function inverseRigidRow(matrix) {
  return [
    matrix[0], matrix[4], matrix[8], 0,
    matrix[1], matrix[5], matrix[9], 0,
    matrix[2], matrix[6], matrix[10], 0,
    -(matrix[12] * matrix[0] + matrix[13] * matrix[1] + matrix[14] * matrix[2]),
    -(matrix[12] * matrix[4] + matrix[13] * matrix[5] + matrix[14] * matrix[6]),
    -(matrix[12] * matrix[8] + matrix[13] * matrix[9] + matrix[14] * matrix[10]),
    1,
  ];
}

/**
 * Invert a row-vector affine transform, including authored MT5 scale.
 * Character attachment chains are usually rigid, but some native models use
 * a scaled root before their render-key attachments. Treating those matrices
 * as rigid squares the scale when converting geometry into attachment space.
 */
export function inverseAffineRow(matrix) {
  const a00 = matrix[0];
  const a01 = matrix[1];
  const a02 = matrix[2];
  const a10 = matrix[4];
  const a11 = matrix[5];
  const a12 = matrix[6];
  const a20 = matrix[8];
  const a21 = matrix[9];
  const a22 = matrix[10];
  const determinant = (
    a00 * (a11 * a22 - a12 * a21)
    - a01 * (a10 * a22 - a12 * a20)
    + a02 * (a10 * a21 - a11 * a20)
  );
  if (Math.abs(determinant) <= 1e-12) {
    throw new Error("MT5 affine transform is singular");
  }
  const inverseDeterminant = 1 / determinant;
  const inverse = [
    (a11 * a22 - a12 * a21) * inverseDeterminant,
    (a02 * a21 - a01 * a22) * inverseDeterminant,
    (a01 * a12 - a02 * a11) * inverseDeterminant,
    0,
    (a12 * a20 - a10 * a22) * inverseDeterminant,
    (a00 * a22 - a02 * a20) * inverseDeterminant,
    (a02 * a10 - a00 * a12) * inverseDeterminant,
    0,
    (a10 * a21 - a11 * a20) * inverseDeterminant,
    (a01 * a20 - a00 * a21) * inverseDeterminant,
    (a00 * a11 - a01 * a10) * inverseDeterminant,
    0,
    0, 0, 0, 1,
  ];
  const translation = [matrix[12], matrix[13], matrix[14]];
  inverse[12] = -(
    translation[0] * inverse[0]
    + translation[1] * inverse[4]
    + translation[2] * inverse[8]
  );
  inverse[13] = -(
    translation[0] * inverse[1]
    + translation[1] * inverse[5]
    + translation[2] * inverse[9]
  );
  inverse[14] = -(
    translation[0] * inverse[2]
    + translation[1] * inverse[6]
    + translation[2] * inverse[10]
  );
  return inverse;
}

export function rowScale(x, y, z) {
  return [
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1,
  ];
}

export function rowRotationX(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    1, 0, 0, 0,
    0, cos, sin, 0,
    0, -sin, cos, 0,
    0, 0, 0, 1,
  ];
}

export function rowRotationY(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    cos, 0, -sin, 0,
    0, 1, 0, 0,
    sin, 0, cos, 0,
    0, 0, 0, 1,
  ];
}

export function rowRotationZ(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    cos, sin, 0, 0,
    -sin, cos, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function rowTranslation(x, y, z) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

export function transformRowPoint(point, matrix) {
  const [x, y, z] = point;
  return [
    x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12],
    x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13],
    x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14],
  ];
}

export function transformRowVector(vector, matrix) {
  const [x, y, z] = vector;
  return [
    x * matrix[0] + y * matrix[4] + z * matrix[8],
    x * matrix[1] + y * matrix[5] + z * matrix[9],
    x * matrix[2] + y * matrix[6] + z * matrix[10],
  ];
}

export function sourceTransformMatrix(node, pose = null, options = {}) {
  let { x: rotX, y: rotY, z: rotZ } = node.rot;
  let { x: posX, y: posY, z: posZ } = node.pos;
  if (pose) {
    const rotationSigns = options.rotationSigns || [1, 1, 1];
    const positionSigns = options.positionSigns || [1, 1, 1];
    const rotationScale = options.rotationScale ?? 1;
    const poseRotation = ["rx", "ry", "rz"].map(
      (key, index) => (pose[key] || 0) * rotationScale * rotationSigns[index],
    );
    if (options.applyMode === "absolute") {
      [rotX, rotY, rotZ] = poseRotation;
    } else {
      rotX += poseRotation[0];
      rotY += poseRotation[1];
      rotZ += poseRotation[2];
    }
    if (options.useTranslations === true) {
      const posePosition = ["tx", "ty", "tz"].map(
        (key, index) => (pose[key] || 0) * positionSigns[index],
      );
      if (options.applyMode === "absolute") {
        [posX, posY, posZ] = posePosition;
      } else {
        posX += posePosition[0];
        posY += posePosition[1];
        posZ += posePosition[2];
      }
    }
  }
  return rowMultiply(
    rowMultiply(
      rowMultiply(
        rowMultiply(
          rowScale(node.scl.x, node.scl.y, node.scl.z),
          rowRotationX(rotX),
        ),
        rowRotationY(rotY),
      ),
      rowRotationZ(rotZ),
    ),
    rowTranslation(posX, posY, posZ),
  );
}

export function browserTransformMatrix(node) {
  const flipX = rowScale(-1, 1, 1);
  return rowMultiply(rowMultiply(flipX, sourceTransformMatrix(node)), flipX);
}

export function sourceOrderQuaternion(rotX, rotY, rotZ) {
  const matrix = BABYLON.Matrix.FromArray(
    rowMultiply(
      rowMultiply(rowRotationX(rotX), rowRotationY(rotY)),
      rowRotationZ(rotZ),
    ),
  );
  const rotation = new BABYLON.Quaternion();
  matrix.decompose(undefined, rotation, undefined);
  return rotation;
}

export function inverseSourceTransformMatrix(node) {
  return rowMultiply(
    rowMultiply(
      rowMultiply(
        rowMultiply(
          rowTranslation(-node.pos.x, -node.pos.y, -node.pos.z),
          rowRotationZ(-node.rot.z),
        ),
        rowRotationY(-node.rot.y),
      ),
      rowRotationX(-node.rot.x),
    ),
    rowScale(
      node.scl.x === 0 ? 1 : 1 / node.scl.x,
      node.scl.y === 0 ? 1 : 1 / node.scl.y,
      node.scl.z === 0 ? 1 : 1 / node.scl.z,
    ),
  );
}
