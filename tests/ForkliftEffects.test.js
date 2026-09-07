import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  ForkliftEffects,
  forkliftExhaustEmitterPosition,
} from "../play/forklift/ForkliftEffects.js";

test("detailed forklift exhaust clears the rear bodywork", () => {
  const position = forkliftExhaustEmitterPosition({
    chassisBounds: {
      minimum: new BABYLON.Vector3(-0.6, 0.001625, -1.857),
      maximum: new BABYLON.Vector3(0.608, 2.154849, 1.088187),
    },
  });
  assert.equal(position.x, 0);
  assert.ok(Math.abs(position.y - 0.721625) < 1e-9);
  assert.ok(position.z > 1.22);
});

test("tire marks begin only after contact, speed, and slip thresholds", () => {
  const effects = new ForkliftEffects({});
  const calls = [];
  effects.rearTireContacts = () => [
    BABYLON.Vector3.Zero(),
    BABYLON.Vector3.One(),
  ];
  effects.createTireMarkTrail = () => ({
    addContacts: (contacts) => calls.push(["add", contacts]),
    endTrail: () => calls.push(["end"]),
    dispose() {},
  });

  effects.updateTireMarks({
    pose: { forwardSpeed: 2.4, tireContact: 1, tireSlipSpeed: 1 },
  });
  assert.equal(effects.tireMarks, null);

  effects.updateTireMarks({
    pose: { forwardSpeed: 3, tireContact: 1, tireSlipSpeed: 0.5 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "add");

  effects.updateTireMarks({
    pose: { forwardSpeed: 0, tireContact: 1, tireSlipSpeed: 1 },
  });
  assert.deepEqual(calls.map(([type]) => type), ["add", "end"]);
});
