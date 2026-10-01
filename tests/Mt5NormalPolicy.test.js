import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  alignMt5CharacterSurfaceOrientations,
  applyMt5NormalPolicy,
  mt5AuthoredSideOrientation,
  shouldFlipMt5Normals,
} from "../src/Mt5NormalPolicy.js";

test("body and lining choose stable front sides under mirroring and either scene handedness", () => {
  const engine = new BABYLON.NullEngine();
  try {
    for (const rightHanded of [false, true]) {
      const scene = new BABYLON.Scene(engine);
      scene.useRightHandedSystem = rightHanded;
      for (const mirror of [1, -1]) {
        const root = new BABYLON.TransformNode("character", scene);
        root.scaling.x = mirror;
        const exterior = new BABYLON.Mesh("exterior", scene);
        const lining = new BABYLON.Mesh("lining", scene);
        for (const [mesh, sign] of [[exterior, 1], [lining, -1]]) {
          mesh.parent = root;
          mesh.setVerticesData("position", [0, 0, 0, 1, 0, 0, 0, 1, 0]);
          mesh.setVerticesData("normal", [0, 0, sign, 0, 0, sign, 0, 0, sign]);
          mesh.setIndices(sign === 1 ? [0, 1, 2] : [0, 2, 1]);
          const normals = Array.from(mesh.getVerticesData("normal"));
          const indices = Array.from(mesh.getIndices());
          mesh.sideOrientation = mt5AuthoredSideOrientation(mesh);
          assert.equal(mt5AuthoredSideOrientation(mesh), mesh.sideOrientation, "preparing cloth must not toggle a loader-aligned side");
          assert.deepEqual(Array.from(mesh.getVerticesData("normal")), normals);
          assert.deepEqual(Array.from(mesh.getIndices()), indices);
        }
        assert.equal(exterior.sideOrientation, lining.sideOrientation);
        // Model Babylon's front-face selection including its negative-world-
        // determinant reversal. Opposite authored sides must remain culled.
        for (const cameraZ of [3, -3]) {
          const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, cameraZ), scene);
          camera.setTarget(BABYLON.Vector3.Zero());
          for (const [mesh, expectedFront] of [[exterior, cameraZ > 0], [lining, cameraZ < 0]]) {
            const world = mesh.computeWorldMatrix(true);
            const transform = world.multiply(camera.getViewMatrix()).multiply(camera.getProjectionMatrix());
            const positions = mesh.getVerticesData("position");
            const points = Array.from(mesh.getIndices(), index => BABYLON.Vector3.TransformCoordinates(
              BABYLON.Vector3.FromArray(positions, index * 3), transform,
            ));
            const area = (points[1].x - points[0].x) * (points[2].y - points[0].y)
              - (points[1].y - points[0].y) * (points[2].x - points[0].x);
            const orientation = world.determinant() < 0 ? 1 - mesh.sideOrientation : mesh.sideOrientation;
            const front = orientation === BABYLON.Material.ClockWiseSideOrientation ? area < 0 : area > 0;
            assert.equal(front, expectedFront, `${rightHanded}/${mirror}/${cameraZ}/${mesh.name}`);
          }
          camera.dispose();
        }
        root.dispose();
      }
      scene.dispose();
    }
  } finally {
    engine.dispose();
  }
});

test("shared orientation policy preserves explicit attachment material conventions", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("root", scene);
    const mesh = BABYLON.MeshBuilder.CreatePlane("attachment", {}, scene);
    mesh.parent = root;
    mesh.material = new BABYLON.StandardMaterial("attachment", scene);
    mesh.material.sideOrientation = BABYLON.Material.ClockWiseSideOrientation;
    const original = mesh.sideOrientation;
    alignMt5CharacterSurfaceOrientations(root);
    assert.equal(mesh.sideOrientation, original);
    assert.equal(mesh.material.sideOrientation, BABYLON.Material.ClockWiseSideOrientation);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

function fakeMesh(name, normals) {
  return {
    name,
    metadata: null,
    getVerticesData: (kind) => kind === "normal" ? normals : null,
    setVerticesData(kind, values, updatable, stride) {
      this.written = { kind, values, updatable, stride };
    },
  };
}

test("experimental normal flips are restricted to two JHD0 foliage types", () => {
  assert.equal(
    shouldFlipMt5Normals("S1_JHD0_MAP01.MT5", "mt5_tex_57"),
    true,
  );
  assert.equal(
    shouldFlipMt5Normals("S1_JHD0_MAP01.MT5", "mt5_tex_63"),
    true,
  );
  assert.equal(
    shouldFlipMt5Normals("S1_JHD0_MAP01.MT5", "mt5_tex_58"),
    false,
  );
  assert.equal(
    shouldFlipMt5Normals("S2_JHD0_MAP01.MT5", "mt5_tex_63"),
    false,
  );
});

test("normal policy reverses only the targeted bush normals", () => {
  const bush = fakeMesh("mt5_tex_63", [0.25, 0.75, -0.5]);
  const neighbor = fakeMesh("mt5_tex_62", [0, 1, 0]);
  const root = {
    getDescendants: () => [bush, neighbor],
  };

  assert.equal(applyMt5NormalPolicy(root, "S1_JHD0_MAP01.MT5"), 1);
  assert.deepEqual(bush.written, {
    kind: "normal",
    values: [-0.25, -0.75, 0.5],
    updatable: false,
    stride: 3,
  });
  assert.equal(bush.metadata.experimentalFlippedNormals, true);
  assert.equal(neighbor.written, undefined);
});
