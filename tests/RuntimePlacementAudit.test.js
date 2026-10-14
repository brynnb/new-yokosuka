import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  auditRuntimePlacementRoots,
  inspectRuntimePlacementRoot,
  summarizeRuntimePlacementAudit,
  runtimePlacementBounds,
} from "../src/RuntimePlacementAudit.js";

test("geometry-only bounds exclude empty control nodes and report empty hierarchies",()=>{
  const engine=new BABYLON.NullEngine(),scene=new BABYLON.Scene(engine);
  const control=new BABYLON.Mesh("empty-control",scene);
  assert.equal(runtimePlacementBounds(control),null);
  const body=BABYLON.MeshBuilder.CreateBox("body",{},scene);body.parent=control;body.position.set(5,2,6);
  const bounds=runtimePlacementBounds(control);
  assert.deepEqual(bounds.min.asArray(),[4.5,1.5,5.5]);assert.deepEqual(bounds.max.asArray(),[5.5,2.5,6.5]);
  scene.dispose();engine.dispose();
});

function fixturePlacement() {
  return {
    id: "door-1",
    model: "TEST_DOOR.MT5",
    position: [1, 2, 3],
    runtime: { objectTag: "dor0" },
  };
}

test("verifies a visible renderable placement at its authored transform", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  root.position.set(1, 2, 3);
  const mesh = BABYLON.MeshBuilder.CreateBox("door", {}, scene);
  mesh.parent = root;

  const record = inspectRuntimePlacementRoot(root, fixturePlacement());
  assert.equal(record.status, "verified");
  assert.ok(record.vertexCount > 0);
  assert.deepEqual(record.actualPosition, [1, 2, 3]);
  assert.deepEqual(record.failures, []);
  engine.dispose();
});

test("rejects silent empty loads and invisible geometry", () => {
  const placement = fixturePlacement();
  assert.deepEqual(
    auditRuntimePlacementRoots(placement, [])[0].failures,
    ["loader-returned-no-root"],
  );

  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  root.position.set(1, 2, 3);
  const mesh = BABYLON.MeshBuilder.CreateBox("door", {}, scene);
  mesh.parent = root;
  mesh.visibility = 0;
  const record = inspectRuntimePlacementRoot(root, placement);
  assert.equal(record.status, "failed");
  assert.ok(record.failures.includes("no-visible-renderable-geometry"));
  engine.dispose();
});

test("summary requires every expected placement to instantiate", () => {
  const placement = fixturePlacement();
  const missing = auditRuntimePlacementRoots(placement, []);
  const summary = summarizeRuntimePlacementAudit([placement], missing);
  assert.equal(summary.status, "failed");
  assert.equal(summary.missingPlacementCount, 1);
});
