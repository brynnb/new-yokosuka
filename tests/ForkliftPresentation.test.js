import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  interpolateForkliftPose,
} from "../src/ForkliftPresentation.js";

test("local forklift presentation interpolates physics snapshots", () => {
  const previous = {
    position: new BABYLON.Vector3(0, 1, 2),
    orientation: BABYLON.Quaternion.Identity(),
  };
  const current = {
    position: new BABYLON.Vector3(2, 3, 4),
    orientation: BABYLON.Quaternion.RotationAxis(
      BABYLON.Axis.Y,
      Math.PI,
    ),
  };
  const pose = interpolateForkliftPose(previous, current, 0.25);
  assert.ok(pose.position.equalsWithEpsilon(
    new BABYLON.Vector3(0.5, 1.5, 2.5),
  ));
  const forward = BABYLON.Vector3.TransformNormal(
    BABYLON.Axis.Z,
    BABYLON.Matrix.FromQuaternionToRef(
      pose.orientation,
      BABYLON.Matrix.Identity(),
    ),
  );
  assert.ok(Math.abs(forward.x - Math.SQRT1_2) < 1e-6);
});
