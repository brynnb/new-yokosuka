import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "./Mt5Loader.js";

export function mt5BrowserRotation(node) {
  const sourceRotation = node?._mt5Node?.rot;
  if (sourceRotation) {
    return [
      sourceRotation.x,
      -sourceRotation.y,
      -sourceRotation.z,
    ];
  }
  return [node.rotation.x, node.rotation.y, node.rotation.z];
}

export function setSourceOrderRotation(node, rotation) {
  node.rotation.setAll(0);
  node.rotationQuaternion = Mt5Loader.sourceOrderQuaternion(...rotation);
}

export function rotationWithAxis(rotation, axis, value) {
  const result = [...rotation];
  result[axis] = value;
  return result;
}

export function nodeRotationMatrix(node) {
  if (node.rotationQuaternion) {
    return BABYLON.Matrix.FromQuaternionToRef(
      node.rotationQuaternion,
      BABYLON.Matrix.Identity(),
    );
  }
  return BABYLON.Matrix.RotationYawPitchRoll(
    node.rotation.y,
    node.rotation.x,
    node.rotation.z,
  );
}
