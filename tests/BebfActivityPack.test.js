import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { NativeAseqMapLayerRuntime } from "../play/events/NativeAseqMapLayerRuntime.js";

const manifest = JSON.parse(readFileSync("play/assets/hazuki/bebf/manifest.json"));
const owner = JSON.parse(readFileSync("play/data/events/nativeEventPrograms.generated.json"))
  .programs.find(value => value.id === "disc1-jomo-bebf-nightmare-owner-0x4bf5c");

test("BEBF's source hides the room before each dream alternative and restores it before waking", () => {
  const actions = owner.functions.find(fn => fn.id === "0x4bf5c")
    .blocks.flatMap(block => block.actions);
  const helperCalls = actions.filter(a => a.kind === "directCall"
    && ["0x4c584", "0x4c50c", "0x4b4f8"].includes(a.targetFileOffset));
  assert.deepEqual(helperCalls.map(a => [a.targetFileOffset, a.arguments[0]?.value]), [
    ["0x4c584", undefined], ["0x4b4f8", 60],
    ["0x4c50c", undefined], ["0x4b4f8", 61],
    ["0x4c584", undefined], ["0x4b4f8", 62],
    ["0x4b4f8", 60], ["0x4c50c", undefined], ["0x4b4f8", 63],
    ["0x4c584", undefined], ["0x4b4f8", 62],
  ]);
  for (const activity of manifest.activities) {
    const visible = ![61, 63].includes(activity.slot);
    const roomStates = activity.browserMapVisibility.filter(s => s.source);
    assert.deepEqual(roomStates.map(s => s.visible), Array(5).fill(visible));
    assert.deepEqual(activity.browserMapVisibility.filter(s => !s.source), [
      { nativeName: "FUT1", visible: false },
      { nativeName: "FUT2", visible: false },
    ]);
    const fn = owner.functions.find(fn => fn.id === (visible ? "0x4c584" : "0x4c50c"));
    const writes = fn.blocks.flatMap(b => b.actions).filter(a => a.operationHex === "0x0098");
    assert.deepEqual(roomStates.map(s => s.source.callFileOffset), writes.map(a => a.callFileOffset));
    assert.deepEqual(activity.browserBackgroundColor, [0, 0, 0, 1]);
  }
});

test("dream map/background ownership restores the room on waking, cancellation, and replay", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const roots = manifest.mapLayers.map(d => {
    const root = new TransformNode(d.nativeName, scene);
    root._filename = d.browserFilename;
    return root;
  });
  const roomRoots = roots.filter(root => /^MAP/.test(root.name));
  const blanketRoots = roots.filter(root => /^FUT/.test(root.name));
  assert.deepEqual(blanketRoots.map(root => root._filename), [
    "S1_JOMO_FUTS301G.MT5", "S1_JOMO_FUTS302G.MT5",
  ]);
  const runtime = new NativeAseqMapLayerRuntime({ definitions: manifest.mapLayers, scene });
  const extraRoom = new TransformNode("extra-resident-room", scene);
  const inactiveRoom = new TransformNode("inactive-room", scene);
  inactiveRoom.setEnabled(false);
  const packageActor = new TransformNode("package-owned-shenhua", scene);
  runtime.load([...roots, extraRoom, inactiveRoom]);
  for (let replay = 0; replay < 2; replay++) {
    runtime.applyActivity(manifest.activities[0]);
    assert.ok(roomRoots.every(root => root.isEnabled()));
    assert.ok(blanketRoots.every(root => !root.isEnabled()));
    runtime.applyActivity(manifest.activities[1]);
    assert.ok(roots.every(root => !root.isEnabled()));
    assert.equal(extraRoom.isEnabled(), false);
    assert.equal(packageActor.isEnabled(), true);
    assert.equal(scene.layers.length, 1);
    assert.equal(scene.layers[0].isBackground, true);
    assert.ok(scene.layers[0].texture);
    runtime.applyActivity(manifest.activities[2]);
    assert.ok(roomRoots.every(root => root.isEnabled()));
    assert.ok(blanketRoots.every(root => !root.isEnabled()));
    assert.equal(extraRoom.isEnabled(), true);
    assert.equal(inactiveRoom.isEnabled(), false);
    runtime.applyActivity(manifest.activities[1]);
    runtime.end();
    assert.ok(roots.every(root => root.isEnabled()));
    assert.equal(scene.layers.length, 0);
  }
  runtime.clear();
  scene.dispose();
  engine.dispose();
});

test("all six JOMO visions use shared isolated staging with their authored scenery", () => {
  for (const name of ["kkya", "kkyb", "kkyc", "kkyd", "kkye", "kkyf"]) {
    const pack = JSON.parse(readFileSync(`play/assets/hazuki/${name}/manifest.json`));
    assert.equal(pack.activities[0].browserIsolatedStage, true);
    assert.deepEqual(pack.activities[0].browserBackgroundColor, [0, 0, 0, 1]);
    assert.deepEqual(pack.activities[0].browserMapVisibility, []);
  }
});
