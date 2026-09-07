import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { CollisionDebugger } from "../play/debug/CollisionDebugger.js";

test("collision debug displays and follows scheduled actor selection boxes", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const actor = new BABYLON.TransformNode("actor", scene);
  const proxy = BABYLON.MeshBuilder.CreateBox(
    "actor_debug_selection",
    { width: 0.6, height: 1.7, depth: 0.5 },
    scene,
  );
  proxy.parent = actor;
  proxy.position.y = 0.85;
  proxy.isVisible = false;
  proxy.isPickable = false;
  proxy.checkCollisions = false;
  proxy.metadata = {
    scheduledActorDebugSelectionProxy: true,
    scheduledActorInstanceId: "TEST:1",
  };

  const collisionDebugger = new CollisionDebugger({
    scene,
    dom: { tintCollisions: { checked: false } },
    enabled: true,
    getWorldId: () => "dobuita",
    getPlayerCollider: () => null,
    boundaryTransitions: [],
  });
  collisionDebugger.show();

  const debugProxy = collisionDebugger.meshes.find(
    (mesh) => mesh.metadata?.scheduledActorDebugSelectionProxy,
  );
  assert.ok(debugProxy);
  assert.equal(debugProxy.isVisible, true);
  assert.equal(debugProxy.parent, proxy);
  assert.deepEqual(debugProxy.position.asArray(), [0, 0, 0]);

  actor.position.x = 4;
  actor.computeWorldMatrix(true);
  debugProxy.computeWorldMatrix(true);
  assert.equal(debugProxy.getAbsolutePosition().x, 4);

  collisionDebugger.clear();
  scene.dispose();
  engine.dispose();
});
