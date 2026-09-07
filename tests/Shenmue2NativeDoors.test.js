import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  bindShenmue2NativeDoors,
  isDirectShenmue2DoorPick,
} from
  "../play/world/Shenmue2NativeDoors.js";

const catalog = JSON.parse(readFileSync(new URL(
  "../play/data/shenmue2-boundary-transitions.json",
  import.meta.url,
)));

test("S.I.C routes are bound to their exact native FLDD and PROP nodes", () => {
  const exterior = catalog.transitions.find(
    ({ id }) => id === "s2-we00-areatbl-78-to-wem1-1",
  );
  const interior = catalog.transitions.find(
    ({ id }) => id === "s2-wem1-areatbl-1-to-we00-78",
  );
  assert.deepEqual(exterior.source.nativeDoor, {
    model: "S2DC_D1_WE00_MPK00_PROP.MT7",
    groupNodeOffset: "0x780",
    panelNodeOffsets: ["0x7d4", "0x828"],
    pickNodeOffsets: ["0x7d4", "0x828"],
    panelDirections: [-1, 1],
    motion: {
      type: "hinged",
      sourceAxis: "y-rotation",
      sourceDirections: [-1, 1],
    },
    binding: "fldd-entry-to-prop-door",
    poseSourceFileOffset: "0xb4b0",
    controllerNodePairs: [
      {
        nodeId: "R239",
        parentNodeId: "R038",
        sourceFileOffset: "0xb5a0",
      },
      {
        nodeId: "R238",
        parentNodeId: "R038",
        sourceFileOffset: "0xb5b0",
      },
    ],
    matchDistance: exterior.source.nativeDoor.matchDistance,
    runnerUpDistance: exterior.source.nativeDoor.runnerUpDistance,
  });
  assert.equal(interior.source.nativeDoor.groupNodeOffset, "0x9c");
  assert.deepEqual(interior.source.nativeDoor.panelNodeOffsets, [
    "0xf0",
    "0x144",
  ]);
  assert.equal(interior.source.nativeDoor.poseSourceFileOffset, "0x1144");
});

test("Bar Swing binds its native grouped and sibling door layouts", () => {
  const exterior = catalog.transitions.find(
    ({ id }) => id === "s2-ar02-areatbl-88-to-ara0-1",
  );
  const interior = catalog.transitions.find(
    ({ id }) => id === "s2-ara0-areatbl-1-to-ar02-88",
  );
  assert.deepEqual(exterior.source.nativeDoor.panelNodeOffsets, [
    "0x3f0",
    "0x498",
  ]);
  assert.deepEqual(interior.source.nativeDoor.panelNodeOffsets, [
    "0x21c",
    "0x2c4",
  ]);
  assert.deepEqual(
    exterior.source.nativeDoor.controllerNodePairs.map(({ nodeId }) => nodeId),
    ["R220", "R221"],
  );
  assert.deepEqual(
    interior.source.nativeDoor.controllerNodePairs.map(({ nodeId }) => nodeId),
    ["R220", "R221"],
  );
  assert.equal(
    exterior.source.nativeDoor.binding,
    "areatbl-door-nodes-to-prop-door",
  );
  assert.equal(
    interior.source.nativeDoor.binding,
    "areatbl-door-nodes-to-prop-door",
  );
});

test("Pigeon Cafe binds one native pivot to both rendered panel pieces", () => {
  const exterior = catalog.transitions.find(
    ({ id }) => id === "s2-ar02-areatbl-89-to-arc0-1",
  );
  const interior = catalog.transitions.find(
    ({ id }) => id === "s2-arc0-areatbl-1-to-ar02-89",
  );
  assert.deepEqual(exterior.source.nativeDoor.panelNodeOffsets, ["0xad4"]);
  assert.deepEqual(exterior.source.nativeDoor.pickNodeOffsets, [
    "0xb28",
    "0xbd0",
  ]);
  assert.deepEqual(interior.source.nativeDoor.panelNodeOffsets, ["0x21c"]);
  assert.deepEqual(interior.source.nativeDoor.pickNodeOffsets, [
    "0x270",
    "0x318",
  ]);
  assert.equal(exterior.source.nativeDoor.controllerNodePairs[0].nodeId, "R702");
  assert.equal(interior.source.nativeDoor.controllerNodePairs[0].nodeId, "R702");
  assert.deepEqual(exterior.source.nativeDoor.motion, {
    type: "paired-sliding",
    sourceAxis: "x",
    sourceDirections: [1, -1],
  });
  assert.deepEqual(interior.source.nativeDoor.motion, {
    type: "paired-sliding",
    sourceAxis: "x",
    sourceDirections: [1, -1],
  });
});

test("every extracted S2 door has a statically classified motion", () => {
  const doors = catalog.transitions
    .map(({ source }) => source.nativeDoor)
    .filter(Boolean);
  assert.equal(doors.length, 17);
  assert.equal(
    doors.filter(({ motion }) => motion.type === "paired-sliding").length,
    6,
  );
  assert.equal(
    doors.filter(({ motion }) => motion.type === "hinged").length,
    11,
  );
  assert.ok(doors.every(({ motion }) => (
    motion.sourceDirections.every((direction) => Math.abs(direction) === 1)
  )));
});

test("native S2 binding makes only the authored door panels clickable", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const modelRoot = new BABYLON.TransformNode("prop", scene);
  modelRoot._filename = "S2DC_D1_WE00_MPK00_PROP.MT7";
  const group = new BABYLON.TransformNode("group", scene);
  const left = new BABYLON.TransformNode("left", scene);
  const right = new BABYLON.TransformNode("right", scene);
  const staticFrame = new BABYLON.TransformNode("frame", scene);
  group.parent = modelRoot;
  left.parent = group;
  right.parent = group;
  staticFrame.parent = group;
  left.rotationQuaternion = BABYLON.Quaternion.Identity();
  right.rotationQuaternion = BABYLON.Quaternion.Identity();
  modelRoot._mt7Nodes = [
    { sourceNode: { offset: 0x780 }, transform: group },
    { sourceNode: { offset: 0x7d4, position: [-0.9, 0, 0] }, transform: left },
    { sourceNode: { offset: 0x828, position: [0.9, 0, 0] }, transform: right },
  ];
  const registered = [];
  const setMetadata = (target, property, value) => {
    for (const node of [target, ...target.getDescendants(false)]) {
      node.metadata = { ...(node.metadata || {}), [property]: value };
    }
  };
  const [door] = bindShenmue2NativeDoors({
    currentMeshes: [modelRoot],
    transitions: [catalog.transitions.find(
      ({ id }) => id === "s2-we00-areatbl-78-to-wem1-1",
    )],
    worldId: "s2we00",
    doorInteractions: {
      registerShenmue2Hinged(root, panels, transition) {
        const value = { root, panels, transition };
        registered.push(value);
        for (const panel of panels) {
          setMetadata(panel.transform, "interactiveDoor", value);
        }
        return value;
      },
    },
    setMetadata,
  });

  assert.equal(registered.length, 1);
  assert.equal(door.root, group);
  assert.equal(left.metadata.interactiveMapTransition.transition.id,
    "s2-we00-areatbl-78-to-wem1-1");
  assert.ok(left.metadata.interactiveDoor);
  assert.ok(right.metadata.interactiveDoor);
  assert.equal(group.metadata?.interactiveMapTransition, undefined);
  assert.equal(staticFrame.metadata?.interactiveMapTransition, undefined);
  assert.equal(staticFrame.metadata?.interactiveDoor, undefined);
  scene.dispose();
  engine.dispose();
});

test("native S2 binding follows extracted paired-slider motion metadata", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const modelRoot = new BABYLON.TransformNode("prop", scene);
  modelRoot._filename = "S2DC_D1_AR02_MPK00_PROP.MT7";
  const group = new BABYLON.TransformNode("group", scene);
  const node9a = new BABYLON.TransformNode("node-9a", scene);
  const node99 = new BABYLON.TransformNode("node-99", scene);
  group.parent = modelRoot;
  node9a.parent = group;
  node99.parent = group;
  modelRoot._mt7Nodes = [
    { sourceNode: { offset: 0xad4 }, transform: group },
    {
      sourceNode: { offset: 0xb28, parentOffset: 0xad4, id: 0x9a },
      transform: node9a,
    },
    {
      sourceNode: { offset: 0xbd0, parentOffset: 0xad4, id: 0x99 },
      transform: node99,
    },
  ];
  const calls = [];
  bindShenmue2NativeDoors({
    currentMeshes: [modelRoot],
    transitions: [catalog.transitions.find(
      ({ id }) => id === "s2-ar02-areatbl-89-to-arc0-1",
    )],
    worldId: "s2ar02",
    doorInteractions: {
      registerShenmue2PairedSliding(root, panels, transition) {
        calls.push({ root, panels, transition });
        return { type: "shenmue2-paired-sliding" };
      },
      registerShenmue2Hinged() {
        assert.fail("paired slider must not use the generic hinge adapter");
      },
    },
    setMetadata() {},
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].root, group);
  assert.deepEqual(calls[0].panels.map(({ sourceNode }) => sourceNode.id), [
    0x9a,
    0x99,
  ]);
  scene.dispose();
  engine.dispose();
});

test("native S2 doors require the normal visible-surface pick", () => {
  const door = { type: "shenmue2-hinged" };
  const doorMesh = { metadata: { interactiveDoor: door } };
  const wallMesh = { metadata: {} };
  assert.equal(isDirectShenmue2DoorPick(door, {
    hit: true,
    pickedMesh: doorMesh,
  }), true);
  assert.equal(isDirectShenmue2DoorPick(door, {
    hit: true,
    pickedMesh: wallMesh,
  }), false);
  assert.equal(isDirectShenmue2DoorPick(door, { hit: false }), false);
  assert.equal(isDirectShenmue2DoorPick(
    { type: "shenmue2-paired-sliding" },
    { hit: true, pickedMesh: wallMesh },
  ), false);
  assert.equal(isDirectShenmue2DoorPick(
    { type: "sliding" },
    { hit: true, pickedMesh: wallMesh },
  ), true);
});
