import assert from "node:assert/strict";
import test from "node:test";

import {
  ScheduledActorRuntime,
} from "../play/characters/ScheduledActorRuntime.js";

function runtimeWithEntries(entries) {
  const runtime = Object.create(ScheduledActorRuntime.prototype);
  runtime.entries = entries;
  runtime.dialogueFacingTargets = new Map();
  runtime.activityActorOwners = new Map();
  return runtime;
}

function vector(x, y, z) {
  return {
    x,
    y,
    z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
  };
}

test("dialogue actor lookup requires an unambiguous scheduled instance", () => {
  const runtime = runtimeWithEntries([{
    definition: { actorCode: "HATO", instanceId: "hato-1" },
    root: { position: { x: 1, y: 2, z: 3 } },
  }]);
  assert.deepEqual(runtime.dialogueActor("hato", "hato-1"), {
    actorCode: "HATO", instanceId: "hato-1", position: [1, 2, 3],
  });
  assert.equal(runtime.dialogueActorModel("hato", "hato-1"), null);
  runtime.entries.push({
    definition: { actorCode: "HATO", instanceId: "hato-2" },
    root: { position: { x: 4, y: 5, z: 6 } },
  });
  assert.equal(runtime.dialogueActor("HATO"), null);
});

test("dialogue model lookup returns only one enabled model", () => {
  const enabled = { root: { isEnabled: () => true } };
  const disabled = { root: { isEnabled: () => false } };
  const runtime = runtimeWithEntries([{
    definition: { actorCode: "HATO", instanceId: "hato-1" },
    defaultModel: enabled,
    models: new Map([["other", disabled]]),
    root: { position: vector(0, 0, 0) },
  }]);
  assert.equal(runtime.dialogueActorModel("HATO"), enabled);
  disabled.root.isEnabled = () => true;
  assert.equal(runtime.dialogueActorModel("HATO"), null);
});

test("dialogue facing state can be restored without retaining aliases", () => {
  const runtime = runtimeWithEntries([]);
  const state = { target: [1, 2, 3], active: true, source: { event: 4 } };
  runtime.restoreDialogueFacingState("hato-1", state);
  state.target[0] = 99;
  const snapshot = runtime.dialogueFacingState("hato-1");
  assert.deepEqual(snapshot.target, [1, 2, 3]);
  snapshot.target[1] = 88;
  assert.deepEqual(runtime.dialogueFacingState("hato-1").target, [1, 2, 3]);
  assert.equal(runtime.restoreDialogueFacingState("hato-1", null), true);
});

test("scripted activities own exact scheduled actors and restore their transforms", () => {
  const root = {
    position: vector(1, 2, 3),
    rotation: vector(0, 0.5, 0),
    scaling: vector(1, 1, 1),
    rotationQuaternion: null,
    enabled: true,
    isEnabled() { return this.enabled; },
    setEnabled(value) { this.enabled = value; },
  };
  const model = { root, modelCode: "SMTH" };
  const entry = {
    definition: { actorCode: "SMTH", instanceId: "smith-d000" },
    defaultModel: model,
    models: new Map(),
    motionKey: "ordinary-motion",
    motionElapsedSeconds: 4,
  };
  const runtime = runtimeWithEntries([entry]);
  const owner = {};
  assert.deepEqual(runtime.beginActivityActors(owner, ["SMTH"]), [{
    actorCode: "SMTH",
    instanceId: "smith-d000",
    root,
    model,
  }]);
  assert.equal(runtime.activityActor(owner, "SMTH").model, model);
  root.position.set(8, 9, 10);
  root.rotation.set(1, 2, 3);
  assert.equal(runtime.endActivityActors(owner), true);
  assert.deepEqual([root.position.x, root.position.y, root.position.z], [1, 2, 3]);
  assert.deepEqual([root.rotation.x, root.rotation.y, root.rotation.z], [0, 0.5, 0]);
  assert.equal(entry.motionKey, null);
  assert.equal(runtime.activityActor(owner, "SMTH"), null);
});

test("scripted activities can acquire an inactive resident's default model", () => {
  const root = {
    position: vector(1, 2, 3),
    rotation: vector(0, 0, 0),
    scaling: vector(1, 1, 1),
    rotationQuaternion: null,
    enabled: false,
    isEnabled() { return this.enabled; },
    setEnabled(value) { this.enabled = value; },
  };
  const model = { root, modelCode: "FUK_M" };
  const runtime = runtimeWithEntries([{
    definition: { actorCode: "FUKU", instanceId: "fuku-resident" },
    defaultModel: model,
    models: new Map([["FUK_M", model]]),
  }]);
  const owner = {};

  assert.deepEqual(runtime.beginActivityActors(owner, ["FUKU"]), [{
    actorCode: "FUKU",
    instanceId: "fuku-resident",
    root,
    model,
  }]);
  assert.equal(root.isEnabled(), true);
  assert.equal(runtime.endActivityActors(owner), true);
  assert.equal(root.isEnabled(), false);
});

test("scripted activity ownership rejects ambiguous and already-owned actors", () => {
  const makeEntry = instanceId => ({
    definition: { actorCode: "SMTH", instanceId },
    defaultModel: {
      root: {
        position: vector(0, 0, 0),
        rotation: vector(0, 0, 0),
        scaling: vector(1, 1, 1),
        rotationQuaternion: null,
        enabled: true,
        isEnabled() { return this.enabled; },
        setEnabled(value) { this.enabled = value; },
      },
    },
    models: new Map(),
  });
  const runtime = runtimeWithEntries([makeEntry("smith-1"), makeEntry("smith-2")]);
  assert.throws(
    () => runtime.beginActivityActors({}, ["SMTH"]),
    /not unique/,
  );
  runtime.entries.pop();
  const owner = {};
  runtime.beginActivityActors(owner, ["SMTH"]);
  assert.throws(
    () => runtime.beginActivityActors({}, ["SMTH"]),
    /already owned/,
  );
  runtime.endActivityActors(owner);
});

test("activity-only actors remain hidden except while exactly owned", () => {
  const root = {
    position: vector(0, 0, 0),
    rotation: vector(0, 0, 0),
    scaling: vector(1, 1, 1),
    rotationQuaternion: null,
    enabled: false,
    isEnabled() { return this.enabled; },
    setEnabled(value) { this.enabled = value; },
  };
  const model = { root, modelCode: "GIB_M" };
  const runtime = runtimeWithEntries([{
    definition: { actorCode: "SMTH", activityOnly: true },
    defaultModel: model,
    models: new Map(),
  }]);
  const owner = {};
  runtime.beginActivityActors(owner, ["SMTH"]);
  assert.equal(root.isEnabled(), true);
  assert.equal(runtime.endActivityActors(owner), true);
  assert.equal(root.isEnabled(), false);
});
