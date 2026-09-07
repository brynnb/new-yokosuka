import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";
import {
  mt5BrowserRotation,
  nodeRotationMatrix,
  rotationWithAxis,
  setSourceOrderRotation,
} from "../src/Mt5InteractionRotation.js";
import { Mt5Loader } from "../src/Mt5Loader.js";

test("interactive MT5 rotations update the active quaternion", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const node = new BABYLON.TransformNode("interactive-node", scene);
  node._mt5Node = {
    rot: {
      x: Math.PI / 6,
      y: Math.PI / 3,
      z: -Math.PI / 8,
    },
  };
  const bindRotation = mt5BrowserRotation(node);
  setSourceOrderRotation(node, bindRotation);
  const bindQuaternion = node.rotationQuaternion.clone();
  const animatedRotation = rotationWithAxis(
    bindRotation,
    1,
    bindRotation[1] + Math.PI / 2,
  );

  setSourceOrderRotation(node, animatedRotation);

  assert.deepEqual(node.rotation.asArray(), [0, 0, 0]);
  assert.ok(node.rotationQuaternion);
  assert.ok(
    Math.abs(BABYLON.Quaternion.Dot(
      bindQuaternion,
      node.rotationQuaternion,
    )) < 0.999,
  );
  const expected = Mt5Loader.sourceOrderQuaternion(...animatedRotation);
  assert.ok(
    Math.abs(BABYLON.Quaternion.Dot(
      expected,
      node.rotationQuaternion,
    )) > 1 - 1e-7,
  );
  engine.dispose();
});

test("interactive MT5 bindings preserve browser reflection signs", () => {
  const node = {
    _mt5Node: {
      rot: { x: 0.25, y: -0.5, z: 0.75 },
    },
  };

  assert.deepEqual(mt5BrowserRotation(node), [0.25, 0.5, -0.75]);
});

test("derives interaction directions from Babylon 6 quaternion matrices", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const node = new BABYLON.TransformNode("placed-root", scene);
  node.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
    BABYLON.Axis.Y,
    Math.PI / 2,
  );

  const forward = BABYLON.Vector3.TransformNormal(
    BABYLON.Axis.Z,
    nodeRotationMatrix(node),
  ).normalize();

  assert.ok(Math.abs(forward.x - 1) < 1e-6);
  assert.ok(Math.abs(forward.y) < 1e-6);
  assert.ok(Math.abs(forward.z) < 1e-6);
  engine.dispose();
});
