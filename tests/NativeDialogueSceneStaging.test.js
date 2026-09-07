import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeDialogueSceneStaging,
  nativeDialogueBrowserFacingTarget,
  nativeDialogueBrowserVector,
} from "../play/dialogue/NativeDialogueSceneStaging.js";
import {
  createNativeDialogueInteractionRuntime,
} from "../play/dialogue/NativeDialogueInteractionRuntime.js";
import {
  createNativeDialogueSnapshot,
} from "../play/dialogue/NativeDialogueSnapshot.js";

test("dialogue staging converts native FACE targets to browser coordinates", () => {
  assert.deepEqual(
    nativeDialogueBrowserFacingTarget([-19.2, 1.5, 76.4]),
    [19.2, 1.5, 76.4],
  );
  assert.deepEqual(
    nativeDialogueBrowserVector([-0.001, 0, 0]),
    [0.001, 0, 0],
  );
});

test("dialogue staging preserves FACE target activation semantics", () => {
  const calls = [];
  const staging = createNativeDialogueSceneStaging({
    scheduledActors: {
      setDialogueFacingTarget(instanceId, target, options) {
        calls.push(["set", instanceId, target, options]);
        return true;
      },
      setDialogueFacingOffset() {
        return true;
      },
      clearDialogueFacingTarget(instanceId) {
        calls.push(["clear", instanceId]);
        return true;
      },
    },
  });
  staging.begin({
    id: "AKSK:0c119848e28a",
    actorCode: "AKSK",
  });

  const updated = staging.handleNativeCommand({
    actor: { actorCode: "AKSK" },
    command: { commandWord: 0x78 },
    facingTarget: {
      index: 0,
      scenePosition: [6, 1.5, 86],
      appliesControlStateTransition: false,
      handlerAddress: "0x0c16188c",
    },
  });
  assert.equal(updated.status, "applied");
  assert.equal(updated.activated, false);
  assert.deepEqual(calls[0], [
    "set",
    "AKSK:0c119848e28a",
    [-6, 1.5, 86],
    {
      activate: false,
      source: {
        commandWord: 0x78,
        targetIndex: 0,
        handlerAddress: "0x0c16188c",
      },
    },
  ]);

  const activated = staging.handleNativeCommand({
    actor: { actorCode: "AKSK" },
    command: { commandWord: 0x14 },
    facingTarget: {
      index: 0,
      scenePosition: [6, 1.5, 86],
      appliesControlStateTransition: true,
      handlerAddress: "0x0c16188c",
    },
  });
  assert.equal(activated.activated, true);
  assert.equal(calls[1][3].activate, true);

  assert.equal(staging.end(), true);
  assert.deepEqual(calls[2], ["clear", "AKSK:0c119848e28a"]);
});

test("dialogue staging applies the proven participant motion-point offset", () => {
  const calls = [];
  const staging = createNativeDialogueSceneStaging({
    scheduledActors: {
      setDialogueFacingTarget() {
        return true;
      },
      setDialogueFacingOffset(instanceId, offset, options) {
        calls.push([instanceId, offset, options]);
        return true;
      },
      clearDialogueFacingTarget() {
        return true;
      },
    },
  });
  staging.begin({ id: "AKSK:one", actorCode: "AKSK" });
  const result = staging.handleNativeCommand({
    actor: { actorCode: "AKSK" },
    command: { commandWord: 0x32 },
    participantRoute: {
      index: 1,
      participantCode: "AKSK",
      behavior: "participantControlDispatch",
      handlerAddress: "0x0c16175c",
      motionPoint: {
        nativeOffset: [-0.001, 0, 0],
        nativeAxis: [0, 1, 0],
        requestAddress: "0x0c0fef0e",
      },
    },
  });
  assert.deepEqual(result, {
    status: "applied",
    instanceId: "AKSK:one",
    actorCode: "AKSK",
    browserOffset: [0.001, 0, 0],
    activated: true,
  });
  assert.deepEqual(calls, [[
    "AKSK:one",
    [0.001, 0, 0],
    {
      activate: true,
      source: {
        commandWord: 0x32,
        participantIndex: 1,
        handlerAddress: "0x0c16175c",
        motionRequestAddress: "0x0c0fef0e",
      },
    },
  ]]);
});

test("dialogue staging rejects commands for a different scene actor", () => {
  let writes = 0;
  const staging = createNativeDialogueSceneStaging({
    scheduledActors: {
      setDialogueFacingTarget() {
        writes += 1;
        return true;
      },
      setDialogueFacingOffset() {
        writes += 1;
        return true;
      },
      clearDialogueFacingTarget() {
        return true;
      },
    },
  });
  staging.begin({ id: "AKSK:one", actorCode: "AKSK" });
  assert.deepEqual(staging.handleNativeCommand({
    actor: { actorCode: "AOKI" },
    facingTarget: {
      scenePosition: [0, 0, 0],
      appliesControlStateTransition: true,
    },
  }), {
    status: "ignored",
    reason: "scene-actor-mismatch",
  });
  assert.equal(writes, 0);
});

test("an authored CMAL conversation drives its recovered FACE target", async () => {
  const writes = [];
  const staging = createNativeDialogueSceneStaging({
    scheduledActors: {
      setDialogueFacingTarget(instanceId, target, options) {
        writes.push({ kind: "target", instanceId, target, options });
        return true;
      },
      setDialogueFacingOffset(instanceId, offset, options) {
        writes.push({ kind: "offset", instanceId, offset, options });
        return true;
      },
      clearDialogueFacingTarget() {
        return true;
      },
    },
  });
  const sceneActor = {
    id: "CMAL:authored-route",
    actorCode: "CMAL",
  };
  const runtime = createNativeDialogueInteractionRuntime({
    onStarted: (_started, options) => staging.begin(options.sceneActor),
    onNativeCommand: dispatch => staging.handleNativeCommand(dispatch),
    onComplete: (detail) => {
      if (detail.kind === "session") staging.end();
    },
  });
  await runtime.start({
    actorCode: "CMAL",
    sceneActor,
    context: {
      gameDate: new Date("1986-01-01T00:00:00Z"),
      yen: 0,
      currentMapIdentity: "NONE",
      playerPosition: [0, 0, 0],
      readStateBank: () => 0,
      readRuntimeComponent: () => 0,
      readActorRuntimeValue: () => 0,
    },
    ...createNativeDialogueSnapshot().sessionOptions(),
    randomFloat: () => 0,
  });

  for (let guard = 0; runtime.status === "running"; guard += 1) {
    assert.ok(guard < 100, "authored dialogue did not finish");
    if (runtime.timeline) runtime.advance();
    await runtime.pending;
  }

  const targetWrites = writes.filter(write => write.kind === "target");
  const offsetWrites = writes.filter(write => write.kind === "offset");
  assert.equal(targetWrites.length, 2);
  for (const write of targetWrites) {
    assert.deepEqual(write, {
      kind: "target",
      instanceId: "CMAL:authored-route",
      target: [38.400001525878906, 1.5, 77.80000305175781],
      options: {
        activate: true,
        source: {
          commandWord: 0x14,
          targetIndex: 0,
          handlerAddress: "0x0c16188c",
        },
      },
    });
  }
  assert.ok(offsetWrites.length > 0);
  for (const write of offsetWrites) {
    assert.deepEqual(write, {
      kind: "offset",
      instanceId: "CMAL:authored-route",
      offset: [0.001, 0, 0],
      options: {
        activate: true,
        source: {
          commandWord: 0x32,
          participantIndex: 1,
          handlerAddress: "0x0c16175c",
          motionRequestAddress: "0x0c0fef0e",
        },
      },
    });
  }
  assert.equal(runtime.status, "complete");
});
