import * as BABYLON from "@babylonjs/core";

export function cloneForkliftPose(pose) {
  if (!pose?.position || !pose?.orientation) return null;
  return {
    ...pose,
    position: pose.position.clone(),
    orientation: pose.orientation.clone().normalize(),
    linearVelocity: pose.linearVelocity?.clone?.() || BABYLON.Vector3.Zero(),
    angularVelocity: pose.angularVelocity?.clone?.() || BABYLON.Vector3.Zero(),
  };
}

export function interpolateForkliftPose(previous, current, amount) {
  if (!current) return cloneForkliftPose(previous);
  if (!previous) return cloneForkliftPose(current);
  const alpha = BABYLON.Scalar.Clamp(Number(amount) || 0, 0, 1);
  return {
    ...current,
    position: BABYLON.Vector3.Lerp(
      previous.position,
      current.position,
      alpha,
    ),
    orientation: BABYLON.Quaternion.Slerp(
      previous.orientation,
      current.orientation,
      alpha,
    ).normalize(),
  };
}
