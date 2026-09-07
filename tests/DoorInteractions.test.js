import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  DoorInteractions,
  logicalDoorScriptObject,
} from "../play/interactions/DoorInteractions.js";

test("logical doors expose stable area-scoped script identities", () => {
  assert.equal(logicalDoorScriptObject("D000", 61), "d000.door.61");
  assert.equal(logicalDoorScriptObject("D000", 51), "d000.door.51");
  assert.equal(logicalDoorScriptObject("", 61), null);
  assert.equal(logicalDoorScriptObject("D000", 1.5), null);
  assert.equal(logicalDoorScriptObject("D000", -1), null);
});

test("sliding doors register, animate, close, and clear as one runtime", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("door-root", scene);
  const movingNode = new BABYLON.TransformNode("door-panel", scene);
  movingNode.parent = root;
  root._mt5Nodes = [{ renderKey: 0x07, mesh: movingNode }];

  const runtime = new DoorInteractions({
    signedRenderKey: (node) => node.renderKey,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata(target, property, value) {
      for (const node of [target, ...target.getDescendants(false)]) {
        node.metadata = { ...(node.metadata || {}), [property]: value };
      }
    },
  });
  const door = runtime.registerSliding(root, {
    runtime: { objectTag: "dor8" },
  });

  assert.equal(runtime.entries.length, 1);
  assert.equal(movingNode.metadata.interactiveDoor, door);
  assert.ok(door.collisionBindPositions[0].equals(
    movingNode.getAbsolutePosition(),
  ));
  runtime.toggle(door);
  runtime.update(1);
  assert.equal(door.state, "open");
  assert.equal(movingNode.position.x, -0.75);

  runtime.toggle(door);
  runtime.update(1);
  assert.equal(door.state, "closed");
  assert.equal(movingNode.position.x, 0);

  runtime.clear();
  assert.equal(runtime.entries.length, 0);
  scene.dispose();
  engine.dispose();
});

test("S2 hinged doors animate their native MT7 leaves only", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("native-door-group", scene);
  const left = new BABYLON.TransformNode("native-left-leaf", scene);
  const right = new BABYLON.TransformNode("native-right-leaf", scene);
  const frame = new BABYLON.TransformNode("static-frame", scene);
  left.parent = root;
  right.parent = root;
  frame.parent = root;
  left.rotationQuaternion = BABYLON.Quaternion.Identity();
  right.rotationQuaternion = BABYLON.Quaternion.Identity();
  const runtime = new DoorInteractions({
    signedRenderKey: () => 0,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata(target, property, value) {
      for (const node of [target, ...target.getDescendants(false)]) {
        node.metadata = { ...(node.metadata || {}), [property]: value };
      }
    },
  });
  const door = runtime.registerShenmue2Hinged(root, [
    { transform: left, sourceNode: { position: [-0.9, 0, 0] } },
    { transform: right, sourceNode: { position: [0.9, 0, 0] } },
  ], { id: "sic" });

  assert.equal(left.metadata.interactiveDoor, door);
  assert.equal(right.metadata.interactiveDoor, door);
  assert.equal(root.metadata?.interactiveDoor, undefined);
  assert.equal(frame.metadata?.interactiveDoor, undefined);
  runtime.setPose(door, { progress: 1 });
  assert.notDeepEqual(left.rotationQuaternion.asArray(), [0, 0, 0, 1]);
  assert.notDeepEqual(
    left.rotationQuaternion.asArray(),
    right.rotationQuaternion.asArray(),
  );
  runtime.setPose(door, { progress: 0 });
  assert.deepEqual(left.rotationQuaternion.asArray(), [0, 0, 0, 1]);
  assert.deepEqual(right.rotationQuaternion.asArray(), [0, 0, 0, 1]);
  scene.dispose();
  engine.dispose();
});

test("S2 native 0x99/0x9a leaves slide apart on their captured curve", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("native-slider", scene);
  const node99 = new BABYLON.TransformNode("native-99", scene);
  const node9a = new BABYLON.TransformNode("native-9a", scene);
  node99.parent = root;
  node9a.parent = root;
  const runtime = new DoorInteractions({
    signedRenderKey: () => 0,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata(target, property, value) {
      target.metadata = { ...(target.metadata || {}), [property]: value };
    },
  });
  const door = runtime.registerShenmue2PairedSliding(root, [
    { transform: node99, sourceNode: { id: 0x99 }, direction: 1 },
    { transform: node9a, sourceNode: { id: 0x9a }, direction: -1 },
  ], { id: "pigeon-cafe" });

  assert.equal(door.type, "shenmue2-paired-sliding");
  runtime.setPose(door, { progress: 1 });
  assert.equal(node99.position.x, 0.89990234375);
  assert.equal(node9a.position.x, -0.89990234375);
  runtime.setPose(door, { progress: 0 });
  assert.equal(node99.position.x, 0);
  assert.equal(node9a.position.x, 0);
  scene.dispose();
  engine.dispose();
});

test("compound S2 doors animate one pivot but pick their visible pieces", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const pivot = new BABYLON.TransformNode("compound-pivot", scene);
  const opaque = new BABYLON.TransformNode("opaque-piece", scene);
  const inset = new BABYLON.TransformNode("inset-piece", scene);
  opaque.parent = pivot;
  inset.parent = pivot;
  pivot.rotationQuaternion = BABYLON.Quaternion.Identity();
  const runtime = new DoorInteractions({
    signedRenderKey: () => 0,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata(target, property, value) {
      target.metadata = { ...(target.metadata || {}), [property]: value };
    },
  });
  const door = runtime.registerShenmue2Hinged(
    pivot,
    [{
      transform: pivot,
      sourceNode: { position: [0, 0, 0] },
      direction: 1,
    }],
    { id: "pigeon-cafe" },
    [opaque, inset],
  );

  assert.equal(pivot.metadata?.interactiveDoor, undefined);
  assert.equal(opaque.metadata.interactiveDoor, door);
  assert.equal(inset.metadata.interactiveDoor, door);
  runtime.setPose(door, { progress: 1 });
  assert.notDeepEqual(pivot.rotationQuaternion.asArray(), [0, 0, 0, 1]);
  scene.dispose();
  engine.dispose();
});

test("door state reports individual collision state changes", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("door-root", scene);
  const movingNode = new BABYLON.TransformNode("door-panel", scene);
  movingNode.parent = root;
  root._mt5Nodes = [{ renderKey: 0x07, mesh: movingNode }];
  const states = [];
  const runtime = new DoorInteractions({
    signedRenderKey: (node) => node.renderKey,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata() {},
    onCollisionStatesChanged: (doors) => {
      states.push(doors.map(({ state }) => state));
    },
  });
  const door = runtime.registerSliding(root, {});
  assert.deepEqual(states.at(-1), ["closed"]);

  runtime.toggle(door);
  assert.deepEqual(states.at(-1), ["opening"]);
  runtime.update(1);
  assert.equal(door.state, "open");
  assert.deepEqual(states.at(-1), ["open"]);

  runtime.toggle(door);
  runtime.update(1);
  assert.equal(door.state, "closed");
  assert.deepEqual(states.at(-1), ["closed"]);

  scene.dispose();
  engine.dispose();
});

test("D000 doors emit one native opening cue and none while closing", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("d000-door-root", scene);
  const movingNode = new BABYLON.TransformNode("door-leaf", scene);
  movingNode.parent = root;
  root._mt5Nodes = [{ renderKey: 0x0c, mesh: movingNode }];
  const cues = [];
  const runtime = new DoorInteractions({
    signedRenderKey: (node) => node.renderKey,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata() {},
    onAudioCue: (cue) => cues.push(cue),
  });
  const door = runtime.registerD000(root, {
    runtime: { doorSelector: 53, objectTag: "dor0" },
  }, {
    renderNodeKey: 0x0c,
    alternateRenderNodeKey: 0x07,
  });

  runtime.toggle(door);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].type, "nativeD000DoorOpening");
  assert.equal(cues[0].doorSelector, 53);
  assert.deepEqual(cues[0].position, { x: 0, y: 0, z: 0 });

  runtime.update(2);
  assert.equal(door.state, "open");
  runtime.toggle(door);
  assert.equal(cues.length, 1);
  scene.dispose();
  engine.dispose();
});

test("DR23 doors emit their proven native cue at each toggle phase", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("dr23-door-root", scene);
  const movingNode = new BABYLON.TransformNode("door-panel", scene);
  movingNode.parent = root;
  root._mt5Nodes = [{ renderKey: 0x07, mesh: movingNode }];
  const cues = [];
  const runtime = new DoorInteractions({
    signedRenderKey: (node) => node.renderKey,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata() {},
    onAudioCue: (cue) => cues.push(cue),
  });
  const door = runtime.registerSliding(root, {
    model: "S1_JOMO_DR23_000.MT5",
    runtime: { objectTag: "dor9" },
  });

  runtime.toggle(door);
  runtime.update(1);
  runtime.toggle(door);
  assert.deepEqual(
    cues.map(({ type, model, phase }) => [type, model, phase]),
    [
      [
        "nativeJomoDoorPhase",
        "S1_JOMO_DR23_000.MT5",
        "openingStart",
      ],
      [
        "nativeJomoDoorPhase",
        "S1_JOMO_DR23_000.MT5",
        "closingStart",
      ],
    ],
  );
  scene.dispose();
  engine.dispose();
});

test("JOMO swing doors emit their model-owned phase pair", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("dr01-door-root", scene);
  const cues = [];
  const runtime = new DoorInteractions({
    signedRenderKey: (node) => node.renderKey,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    setMetadata() {},
    onAudioCue: (cue) => cues.push(cue),
  });
  const door = runtime.registerSwing(root, {
    model: "S1_JOMO_DR01_015.MT5",
    rotationDegrees: [0, 0, 0],
    runtime: { objectTag: "dor6" },
  });

  runtime.toggle(door);
  runtime.update(1);
  runtime.toggle(door);
  assert.deepEqual(
    cues.map(({ model, phase }) => [model, phase]),
    [
      ["S1_JOMO_DR01_015.MT5", "openingStart"],
      ["S1_JOMO_DR01_015.MT5", "closingStart"],
    ],
  );
  scene.dispose();
  engine.dispose();
});
