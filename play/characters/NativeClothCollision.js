import * as BABYLON from "@babylonjs/core";

import { nativeClothBodyCollisionProfile } from "./NativeClothProfiles.js";
import {
  nativeClothControllerMatricesByType,
  nativeClothControllerWorldPosition,
  nativeClothUniformWorldScale,
} from "./NativeClothControllerPose.js";

/**
 * Resolves executable-authored CLTH spheres against the current controller
 * pose. Missing controller state means the body pose has not been installed
 * yet; returning no colliders lets the first coherent pose reset atomically.
 */
export function buildNativeClothBodyColliders({
  modelCode,
  controllerFamily,
  controllerMatrices,
  characterSpaceMatrix,
  runtimeMode = 0,
} = {}) {
  if (!(characterSpaceMatrix instanceof BABYLON.Matrix)) {
    throw new TypeError("native cloth collision requires character space");
  }
  const matricesByType = nativeClothControllerMatricesByType(
    controllerFamily,
    controllerMatrices,
  );
  if (!matricesByType) return Object.freeze([]);
  const profile = nativeClothBodyCollisionProfile(modelCode, runtimeMode);
  const scale = nativeClothUniformWorldScale(characterSpaceMatrix);
  const colliders = [];
  for (const record of profile.records) {
    const worldPoint = nativeClothControllerWorldPosition(
      matricesByType,
      record.controllerType,
      characterSpaceMatrix,
      record.localPosition,
    );
    if (!worldPoint) return Object.freeze([]);
    colliders.push(Object.freeze({
      center: Object.freeze(worldPoint.asArray()),
      radius: record.radius * scale,
      collisionMaskBit: record.collisionMaskBit,
      controllerType: record.controllerType,
    }));
  }
  return Object.freeze(colliders);
}
