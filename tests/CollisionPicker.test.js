import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { CollisionPicker } from "../play/debug/CollisionPicker.js";

function button() {
  return {
    disabled: false,
    textContent: "",
    setAttribute() {},
  };
}

test("collision picker reports the native record behind a selected face", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const source = new BABYLON.Mesh("native_collision_source", scene);
  source.metadata = {
    nativeCollision: true,
    nativeCollisionArea: "JU00",
    nativeCollisionDisc: 1,
    nativeCollisionField: "0000",
    nativeCollisionSectionIndex: 0,
    nativeCollisionCode: 10,
    nativeCollisionSegments: [
      [[49.918, 99.69], [51.444, 97.271]],
    ],
    nativeCollisionSegmentRecordOffsets: [2240],
    sourceModel: "JU00/MAPINFO.BIN COLS/COLI",
  };
  const debugMesh = new BABYLON.Mesh("native_collision_debug", scene);
  const data = new BABYLON.VertexData();
  data.positions = [
    49.918, -32, 99.69,
    51.444, -32, 97.271,
    51.444, 64, 97.271,
    49.918, 64, 99.69,
  ];
  data.indices = [
    0, 1, 2, 0, 2, 3,
    2, 1, 0, 3, 2, 0,
  ];
  data.applyToMesh(debugMesh);
  debugMesh.material = new BABYLON.StandardMaterial("debug", scene);
  debugMesh.metadata = {
    collisionDebug: true,
    sourceCollisionMesh: source,
  };
  const dom = {
    collisionPicker: button(),
    copyCollisionSelection: button(),
  };
  const picker = new CollisionPicker({
    scene,
    dom,
    enabled: true,
    getSkybox: () => null,
    getWorld: () => ({ id: "yamanose", label: "Yamanose" }),
  });

  assert.equal(picker.canSelect(debugMesh), true);
  const selected = picker.faceData(debugMesh, 3);
  assert.equal(selected.collision.native, true);
  assert.equal(selected.collision.area, "JU00");
  assert.equal(selected.collision.code, 10);
  assert.equal(selected.collision.recordOffset, 2240);
  assert.deepEqual(
    selected.collision.segment,
    [[49.918, 99.69], [51.444, 97.271]],
  );

  source.metadata = {
    nativeCollision: true,
    nativeCollisionArea: "WE00",
    nativeCollisionDisc: 1,
    nativeCollisionField: "0000",
    nativeCollisionBehavior: "stair-boundary",
    nativeCollisionFaceIndices: [7],
    nativeCollisionFaceNativeCodes: [10],
    nativeCollisionFacesOffset: 0x1000,
    nativeCollisionSegmentFaceIndices: [],
    nativeCollisionSegments: [],
    sourceModel: "WE00/MAPINFO.BIN FLDD",
  };
  const shenmue2Face = picker.faceData(debugMesh, 3);
  assert.equal(shenmue2Face.collision.area, "WE00");
  assert.equal(shenmue2Face.collision.code, 10);
  assert.equal(shenmue2Face.collision.faceIndex, 7);
  assert.equal(shenmue2Face.collision.recordOffset, 0x1070);
  assert.equal(shenmue2Face.collision.segmentIndex, null);
  assert.equal(shenmue2Face.collision.segment, null);
  scene.dispose();
  engine.dispose();
});
