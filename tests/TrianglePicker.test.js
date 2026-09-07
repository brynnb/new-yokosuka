import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import { TrianglePicker } from "../play/debug/TrianglePicker.js";

function control() {
  return {
    disabled: false,
    textContent: "",
    setAttribute() {},
  };
}

function triangle(scene, name, z) {
  const mesh = new BABYLON.Mesh(name, scene);
  const data = new BABYLON.VertexData();
  data.positions = [-1, -1, z, 1, -1, z, 0, 1, z];
  data.indices = [0, 1, 2];
  data.normals = [];
  BABYLON.VertexData.ComputeNormals(
    data.positions,
    data.indices,
    data.normals,
  );
  data.applyToMesh(mesh);
  mesh.material = new BABYLON.StandardMaterial(`${name}_material`, scene);
  return mesh;
}

test("triangle picker selects a GPU-skinned character at its visible pose", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const actor = triangle(scene, "fukuhara_body", 0);
  actor.isPickable = false;
  actor.metadata = { sourceModel: "FUK_M.MT5" };
  actor.setVerticesData(
    BABYLON.VertexBuffer.MatricesIndicesKind,
    new Float32Array(12),
    false,
    4,
  );
  const weights = new Float32Array(12);
  weights[0] = weights[4] = weights[8] = 1;
  actor.setVerticesData(
    BABYLON.VertexBuffer.MatricesWeightsKind,
    weights,
    false,
    4,
  );
  actor.numBoneInfluencers = 1;
  const skeleton = new BABYLON.Skeleton("actor_skeleton", "actor_skeleton", scene);
  const bone = new BABYLON.Bone(
    "actor_root",
    skeleton,
    null,
    BABYLON.Matrix.Identity(),
    BABYLON.Matrix.Identity(),
    BABYLON.Matrix.Identity(),
    0,
  );
  actor.skeleton = skeleton;
  bone.setPosition(new BABYLON.Vector3(0, 0, 5), BABYLON.Space.LOCAL);
  skeleton.prepare();
  const terrain = triangle(scene, "terrain", 10);
  const picker = new TrianglePicker({
    scene,
    dom: {},
    enabled: true,
    getSkybox: () => null,
    getWorld: () => ({ id: "op00", label: "Introduction" }),
    controls: {
      toggle: control(),
      copy: control(),
      idleLabel: "Triangle picker",
      activeLabel: "Exit triangle picker",
    },
  });

  picker.setActive(true);
  const proxy = picker.pickProxyBySource.get(actor);
  assert.ok(proxy);
  assert.equal(proxy.visibility, 0);
  assert.equal(picker.canSelect(actor), false);
  assert.equal(picker.canSelect(proxy), true);
  assert.deepEqual(
    Array.from(proxy.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
    [-1, -1, 5, 1, -1, 5, 0, 1, 5],
  );

  const pick = scene.pickWithRay(
    new BABYLON.Ray(
      new BABYLON.Vector3(0, 0, -1),
      new BABYLON.Vector3(0, 0, 1),
    ),
    mesh => picker.canSelect(mesh),
  );
  assert.equal(pick.pickedMesh, proxy);
  assert.ok(pick.distance < 10);
  picker.toggleFace(pick);
  assert.equal(picker.selections.size, 1);
  assert.equal([...picker.selections.values()][0].data.meshName, actor.name);
  assert.equal(
    [...picker.selections.values()][0].data.sourceModel,
    "FUK_M.MT5",
  );

  picker.setActive(false);
  assert.equal(actor.isPickable, false);
  assert.equal(proxy.isDisposed(), true);
  terrain.dispose(false, true);
  actor.dispose(false, true);
  skeleton.dispose();
  scene.dispose();
  engine.dispose();
});

test("triangle picker hides collision debug geometry and restores it on exit", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const collision = triangle(scene, "fukuhara_collision_debug", 5);
  collision.metadata = { collisionDebug: true };
  collision.isPickable = false;
  const picker = new TrianglePicker({
    scene,
    dom: {},
    enabled: true,
    getSkybox: () => null,
    getWorld: () => ({ id: "op00", label: "Introduction" }),
    controls: {
      toggle: control(),
      copy: control(),
      idleLabel: "Triangle picker",
      activeLabel: "Exit triangle picker",
    },
  });

  picker.setActive(true);
  assert.equal(collision.isEnabled(), false);
  assert.equal(picker.canSelect(collision), false);

  picker.setActive(false);
  assert.equal(collision.isEnabled(), true);
  assert.equal(collision.isPickable, false);

  collision.dispose(false, true);
  scene.dispose();
  engine.dispose();
});

test("triangle picker preserves clockwise character-face culling", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const face = triangle(scene, "native_face_AKIR", 0);
  face.material.backFaceCulling = true;
  face.material.sideOrientation = BABYLON.Material.ClockWiseSideOrientation;
  const originalMaterial = face.material;
  const picker = new TrianglePicker({
    scene,
    dom: {},
    enabled: true,
    getSkybox: () => null,
    getWorld: () => ({ id: "op00", label: "Introduction" }),
    controls: {
      toggle: control(),
      copy: control(),
      idleLabel: "Triangle picker",
      activeLabel: "Exit triangle picker",
    },
  });

  picker.setActive(true);
  assert.ok(picker.selectionMaterial);
  assert.notEqual(face.material, originalMaterial);
  assert.equal(face.material.backFaceCulling, true);
  assert.equal(
    face.material.sideOrientation,
    BABYLON.Material.ClockWiseSideOrientation,
  );
  const wire = picker.wireMeshes.find(
    mesh => mesh.metadata?.sourceMesh === face,
  );
  assert.ok(wire);
  assert.equal(wire.material.backFaceCulling, true);
  assert.equal(
    wire.material.sideOrientation,
    BABYLON.Material.ClockWiseSideOrientation,
  );
  picker.toggleFace({ pickedMesh: face, faceId: 0 });
  assert.equal(
    [...picker.selections.values()][0].overlay.material,
    picker.selectionMaterial,
  );

  picker.setActive(false);
  assert.equal(picker.selectionMaterial, null);
  assert.equal(face.material, originalMaterial);
  face.dispose(false, true);
  scene.dispose();
  engine.dispose();
});
