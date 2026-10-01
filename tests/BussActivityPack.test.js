import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { NativeAseqAttachedObjectRuntime } from "../play/events/NativeAseqAttachedObjectRuntime.js";
import { extractNativeAseqCountedNodeTransformLoop } from "../tools/lib/NativeAseqCallbackObjectPresentation.mjs";

const manifest = JSON.parse(readFileSync("play/assets/dobuita/buss/manifest.json"));
const door = JSON.parse(readFileSync("tools/evidence/buss-door-native-callback-ir.json"));

test("BUSS has the original open-door poses and closing loops for all four exact variants", () => {
  const definition = manifest.attachedObjects.BUS_;
  assert.equal(definition.sceneObject, true);
  assert.deepEqual(definition.attachments, []);
  for (const [members, firstFrame, keys] of [
    [[1, 4], 100, [153, 154]], [[2, 5], 132, [157, 158, 155, 156]],
  ]) {
    for (const member of members) {
      const operations = definition.nodeTransforms.filter(cue => cue.activityId === `BUSS/SEQDATA${member}.AUTH`);
      const initial = operations.filter(cue => cue.frame === 0);
      assert.deepEqual(initial.map(cue => cue.nodeKey), keys);
      assert.deepEqual(initial.map(cue => cue.rotationRaw[1]), member === 1 || member === 4
        ? [14108, 30474] : [14108, -30474, -14108, 30474]);
      const steps = operations.filter(cue => cue.mode === "add");
      assert.equal(steps.length, keys.length);
      assert.ok(steps.every(cue => cue.firstFrame === firstFrame && cue.lastFrame === firstFrame + 30));
      assert.deepEqual(steps.map(cue => cue.rotationRaw[1]), keys.length === 2
        ? [-455, 983] : [-455, 983, 455, -983]);
    }
  }
  const invalid = structuredClone(door.function);
  invalid.blocks.flatMap(block => block.actions).find(action => (
    action.semanticId === "native-scheduler-countdown"
  )).runtimeDispatch.arguments[0].value = 2;
  assert.throws(() => extractNativeAseqCountedNodeTransformLoop({
    nativeFunction: invalid, selector: 2, firstFrame: 132,
  }), /single-tick counter/);
});

test("borrowed animated parts support seeking, replay and cancellation without taking the AUTH root", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const bus = new BABYLON.TransformNode("bus", scene);
    bus._mt5Nodes = [153, 154, 155, 156, 157, 158].map(renderKey => {
      const mesh = new BABYLON.TransformNode(`hinge-${renderKey}`, scene);
      mesh.parent = bus;
      return { renderKey, mesh, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } };
    });
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: manifest.attachedObjects,
      resolveActor: () => null,
      resolveSceneObject: () => ({ root: bus }),
    });
    await runtime.load([]);
    const hinge = bus._mt5Nodes.find(node => node.renderKey === 157).mesh;
    for (const endFrame of [246, 140, 20]) {
      runtime.beginActivity({ activityId: "BUSS/SEQDATA2.AUTH", actors: ["BUS_"] });
      bus.setEnabled(true);
      bus.position.set(3, 4, 5);
      assert.equal(runtime.update(20), true);
      const open = hinge.rotationQuaternion.clone();
      assert.ok(Math.abs(open.y) > 0.5);
      runtime.update(162);
      assert.ok(Math.abs(hinge.rotationQuaternion.y) < 0.03);
      runtime.update(20);
      assert.ok(hinge.rotationQuaternion.equalsWithEpsilon(open));
      runtime.update(endFrame);
      runtime.endActivity();
      assert.ok(Math.abs(hinge.rotationQuaternion.y) < 1e-6);
      assert.deepEqual(bus.position.asArray(), [3, 4, 5]);
      assert.equal(bus.isEnabled(), true);
    }
    runtime.clear();
  } finally { scene.dispose(); engine.dispose(); }
});
