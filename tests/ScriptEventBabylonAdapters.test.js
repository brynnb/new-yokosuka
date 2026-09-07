import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptEventBabylonAdapters,
} from "../play/scripts/ScriptEventBabylonAdapters.js";

function harness({
  area = "D000",
  telephoneRuntime = null,
  motionCueRuntime = null,
  playerXmptRuntime = null,
} = {}) {
  const calls = [];
  let motionStatus = 0;
  let movementLocked = false;
  let deferActivity = false;
  let resolveActivity = null;
  const facing = new Map([["hato-1", {
    target: [9, 8, 7], active: true,
  }]]);
  const cameraRuntime = {
    beginTransaction: detail => (calls.push(["camera-begin", detail]), "camera"),
    requestCamera: detail => (calls.push(["camera", detail]), true),
    selectMode: detail => (calls.push(["camera-mode", detail]), true),
    update: delta => (calls.push(["camera-update", delta]), true),
    commitTransaction: token => (calls.push(["camera-commit", token]), true),
    rollbackTransaction: token => (calls.push(["camera-rollback", token]), true),
  };
  const playerMotionRuntime = {
    beginTransaction: () => (calls.push(["motion-begin"]), "motion"),
    requestMotion: detail => (calls.push(["motion", detail]), true),
    readMotionStatus: () => motionStatus,
    commitTransaction: token => (calls.push(["motion-commit", token]), true),
    rollbackTransaction: token => (calls.push(["motion-rollback", token]), true),
  };
  const scheduledActors = {
    dialogueActor: () => ({
      actorCode: "HATO", instanceId: "hato-1", position: [1, 2, 3],
    }),
    dialogueFacingState: id => structuredClone(facing.get(id) || null),
    restoreDialogueFacingState: (id, state) => {
      calls.push(["facing-restore", id, state]);
      if (state) facing.set(id, structuredClone(state));
      else facing.delete(id);
      return true;
    },
    setDialogueFacingTarget: (id, target) => {
      calls.push(["facing-set", id, target]);
      facing.set(id, { target: [...target], active: true });
      return true;
    },
  };
  const adapters = createScriptEventBabylonAdapters({
    cameraRuntime,
    playerMotionRuntime,
    playerXmptRuntime,
    scheduledActors,
    getArea: () => area,
    getPlayerPosition: () => [4, 5, 6],
    beginCameraPresentation: () => calls.push(["presentation-begin"]),
    abortCameraPresentation: () => calls.push(["presentation-abort"]),
    getMovementLocked: () => movementLocked,
    setMovementLocked: value => {
      movementLocked = value;
      calls.push(["movement", value]);
    },
    startActivity: async (activity, context) => {
      calls.push(["activity", activity, context]);
      if (deferActivity) {
        return new Promise(resolve => { resolveActivity = resolve; });
      }
      return true;
    },
    cancelActivity: (activity, reason) => {
      calls.push(["activity-cancel", activity, reason]);
      resolveActivity?.(false);
      resolveActivity = null;
      return true;
    },
    telephoneRuntime,
    motionCueRuntime,
  });
  return {
    adapters,
    calls,
    facing,
    setMotionComplete: () => { motionStatus = 2; },
    deferActivity: () => { deferActivity = true; },
    movementLocked: () => movementLocked,
  };
}

test("Babylon adapters compose XMPT and motion-cue ownership", () => {
  const motionCueCalls = [];
  const motionCueRuntime = {
    play: (sequence, owner) => (
      motionCueCalls.push(["play", sequence.sequenceId, owner]), true
    ),
    update: owner => (motionCueCalls.push(["update", owner]), true),
    cancel: owner => (motionCueCalls.push(["cancel", owner]), true),
    assertSettled: owner => (motionCueCalls.push(["settled", owner]), true),
  };
  const xmptCalls = [];
  const playerXmptRuntime = {
    beginTransaction: () => (xmptCalls.push(["begin"]), "xmpt"),
    commitTransaction: token => (xmptCalls.push(["commit", token]), true),
    rollbackTransaction: token => (xmptCalls.push(["rollback", token]), true),
  };
  const h = harness({ motionCueRuntime, playerXmptRuntime });
  const transaction = h.adapters.begin({ area: "D000" });
  assert.equal(h.adapters.playSequence({
    kind: "actor-motion-cue-start",
    sequenceId: "d000.door.61.closed-check",
    area: "D000",
  }, transaction), true);
  assert.equal(h.adapters.update(transaction, 1 / 30), true);
  assert.equal(h.adapters.commit(transaction), true);
  assert.deepEqual(xmptCalls, [["begin"], ["commit", "xmpt"]]);
  assert.equal(h.calls.some(([name]) => name === "motion-begin"), true);
  assert.equal(motionCueCalls.at(-1)[0], "settled");
});

test("Babylon adapters own telephone motion and its timeline together", () => {
  const telephoneCalls = [];
  const telephoneRuntime = {
    play: (sequence, owner) => (
      telephoneCalls.push(["play", sequence.callId, owner]), true
    ),
    update: () => true,
    cancel: owner => (telephoneCalls.push(["cancel", owner]), true),
    assertSettled: owner => (
      telephoneCalls.push(["settled", owner]), true
    ),
  };
  const h = harness({ area: "JOMO", telephoneRuntime });
  const transaction = h.adapters.begin({ area: "JOMO" });
  const sequence = {
    kind: "telephone-call-start",
    callId: "jomo.telephone.sa1093.first",
    area: "JOMO",
    motion: {
      actorCode: "AKIR",
      request: 8254,
      parameters: [-1, -1, -1, 1],
    },
  };

  assert.equal(h.adapters.playSequence(sequence, transaction), true);
  const motion = h.calls.find(([name]) => name === "motion");
  assert.equal(motion[1].request, 8254);
  assert.deepEqual(motion[1].source, {
    kind: "database-script",
    sequence: "jomo.telephone.sa1093.first",
  });
  assert.equal(telephoneCalls[0][0], "play");
  assert.equal(h.adapters.commit(transaction), true);
  assert.equal(telephoneCalls.at(-1)[0], "settled");
  assert.ok(h.calls.some(([name]) => name === "motion-commit"));
});

test("Babylon adapters own Hato camera, facing, motion, and cleanup", async () => {
  const h = harness();
  const transaction = h.adapters.begin({
    area: "D000", actorCode: "HATO", actorInstanceId: "hato-1",
  });
  assert.equal(h.adapters.startCamera({
    area: "D000", cameraNumber: 2950,
  }, transaction), true);
  assert.equal(h.adapters.lookAtActor({
    actorCode: "HATO", targetActorCode: "AKIR",
  }, transaction), true);
  const motion = h.adapters.playPlayerMotion({
    actorCode: "AKIR", request: 903, parameters: [-1, -1, -1, 1],
  }, transaction);
  h.setMotionComplete();
  h.adapters.update(transaction, 1 / 60);
  assert.equal(await motion, true);
  assert.equal(h.adapters.clearActorLook({ actorCode: "HATO" }, transaction), true);
  assert.equal(h.adapters.stopCamera(transaction), true);
  assert.equal(h.adapters.commit(transaction), true);
  assert.deepEqual(h.facing.get("hato-1"), {
    target: [9, 8, 7], active: true,
  });
  assert.equal(h.movementLocked(), false);
});

test("Babylon adapter rollback releases a waiting motion and restores facing", async () => {
  const h = harness();
  const transaction = h.adapters.begin({
    area: "D000", actorCode: "HATO", actorInstanceId: "hato-1",
  });
  h.adapters.lookAtActor({
    actorCode: "HATO", targetActorCode: "AKIR",
  }, transaction);
  const motion = h.adapters.playPlayerMotion({
    actorCode: "AKIR", request: 903, parameters: [-1, -1, -1, 1],
  }, transaction);
  assert.equal(h.adapters.rollback(transaction, "disconnect"), true);
  assert.equal(await motion, false);
  assert.equal(h.movementLocked(), false);
  assert.equal(h.calls.some(([name]) => name === "camera-rollback"), false);
  assert.ok(h.calls.some(([name]) => name === "motion-rollback"));
});

test("specialized activity runs without pre-owning its native camera or motion", async () => {
  const h = harness();
  const transaction = h.adapters.begin({
    area: "D000", objectTag: "TBK1", sceneObject: { objectTag: "TBK1" },
  });
  assert.equal(await h.adapters.startActivity({
    kind: "native-object-interaction", area: "D000", objectTag: "TBK1", action: 1,
  }, transaction), true);
  assert.equal(h.calls.some(([name]) => name === "camera-begin"), false);
  assert.equal(h.calls.some(([name]) => name === "motion-begin"), false);
  assert.equal(h.adapters.commit(transaction), true);
  assert.equal(h.movementLocked(), false);
});

test("specialized activity rollback cancels the owned native runner", async () => {
  const h = harness();
  h.deferActivity();
  const transaction = h.adapters.begin({
    area: "D000", objectTag: "TBK1", sceneObject: { objectTag: "TBK1" },
  });
  const activity = {
    kind: "native-object-interaction", area: "D000", objectTag: "TBK1", action: 1,
  };
  const running = h.adapters.startActivity(activity, transaction);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(h.adapters.rollback(transaction, "world-change"), true);
  assert.equal(await running, false);
  assert.deepEqual(h.calls.find(([name]) => name === "activity-cancel"), [
    "activity-cancel", activity, "database-script-rollback",
  ]);
  assert.equal(h.movementLocked(), false);
});
