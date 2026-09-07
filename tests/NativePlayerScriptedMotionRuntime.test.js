import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativePlayerScriptedMotionRuntime,
} from "../play/events/NativePlayerScriptedMotionRuntime.js";

function fakeAnimation() {
  let revision = 0;
  return {
    activeEmote: null,
    activeOneShot: null,
    requests: [],
    releases: [],
    playNativeMotionRequest(request, options) {
      this.requests.push({ request, options });
      this.activeOneShot = {
        playbackRevision: ++revision,
        options,
      };
      return true;
    },
    releaseOneShot(nextState) {
      if (!this.activeOneShot) return false;
      this.releases.push(nextState);
      this.activeOneShot = null;
      return true;
    },
    nativeMotionPhase(playbackRevision) {
      if (this.activeOneShot?.playbackRevision !== playbackRevision) {
        return null;
      }
      return {
        request: this.activeOneShot.options.context.request,
        phase: 0,
        gameTicksPerCycle: 60,
      };
    },
    nativeMotionControllerVector(playbackRevision) {
      return this.activeOneShot?.playbackRevision === playbackRevision
        ? [0, 0, 0]
        : null;
    },
    complete() {
      this.activeOneShot?.options.onComplete();
    },
  };
}

test("scripted player motion reports the exact native completion bit", () => {
  const animation = fakeAnimation();
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.requestMotion({
    actorCode: "AKIR",
    request: 903,
    parameters: [-1, -1, -1, 1],
  }), true);
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 0);
  animation.complete();
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 2);
  assert.equal(runtime.commitTransaction(token), true);
  assert.deepEqual(animation.releases, ["idle"]);
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 2);
  assert.deepEqual(runtime.readControllerState(), {
    requestWord66: 903,
    parameter12c: 0,
    parameter130: 0,
    parameter134: -1,
    parameterDc: 1,
  });
});

test("exposes the transaction-owned MOMT phase and control words", () => {
  const animation = fakeAnimation();
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.requestMotion({
    actorCode: "AKIR",
    request: 0x700b,
    parameters: [-1, -1, -1, 1],
  }), true);
  animation.nativeMotionPhase = playbackRevision => ({
    request: animation.activeOneShot.playbackRevision === playbackRevision
      ? 0x700b
      : null,
    phase: 55.5,
    gameTicksPerCycle: 60,
  });
  assert.deepEqual(runtime.readMomtNumericWords(), {
    floatWordF0: 0x425e0000,
    floatWordDc: 0x3f800000,
  });
  assert.deepEqual(runtime.readMomtScaledOffsetWords(), {
    scaleVectorWords: [0, 0, 0],
  });
  animation.activeOneShot.playbackRevision += 1;
  assert.equal(runtime.readMomtNumericWords(), undefined);
  animation.activeOneShot.playbackRevision -= 1;
  runtime.rollbackTransaction(token);
  assert.equal(runtime.readMomtNumericWords(), undefined);
});

test("a later authored request replaces the transaction-owned motion", () => {
  const animation = fakeAnimation();
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.requestMotion({
    actorCode: "AKIR",
    request: 903,
    parameters: [-1, -1, -1, 1],
  }), true);
  const firstCompletion = animation.requests[0].options.onComplete;
  assert.equal(runtime.requestMotion({
    actorCode: "AKIR",
    request: 100,
    parameters: [-1, -1, -1, 1],
  }), true);
  firstCompletion();
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 0);
  animation.complete();
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 2);
  runtime.commitTransaction(token);
  assert.deepEqual(
    animation.requests.map(({ request }) => request),
    [903, 100],
  );
});

test("rollback releases owned motion and restores prior status state", () => {
  const animation = fakeAnimation();
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  runtime.statuses.set("AKIR", 6);
  runtime.controllerStates.set("AKIR", {
    requestWord66: 40,
    parameter12c: 3,
  });
  const token = runtime.beginTransaction();
  runtime.requestMotion({
    actorCode: "AKIR",
    request: 903,
    parameters: [-1, -1, -1, 1],
  });
  assert.equal(runtime.rollbackTransaction(token), true);
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 6);
  assert.deepEqual(runtime.readControllerState(), {
    requestWord66: 40,
    parameter12c: 3,
  });
  assert.deepEqual(animation.releases, ["idle"]);
});

test("scripted motion fails closed rather than replacing unrelated motion", () => {
  const animation = fakeAnimation();
  animation.activeOneShot = { playbackRevision: 77 };
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.requestMotion({
    actorCode: "AKIR",
    request: 903,
    parameters: [-1, -1, -1, 1],
  }), false);
  assert.equal(animation.activeOneShot.playbackRevision, 77);
  runtime.rollbackTransaction(token);
});

test("scripted motion rejects actors outside its configured owner", () => {
  const animation = fakeAnimation();
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.requestMotion({
    actorCode: "HATO",
    request: 903,
    parameters: [-1, -1, -1, 1],
  }), false);
  assert.equal(animation.requests.length, 0);
  runtime.rollbackTransaction(token);
});

test("motion request applies the proven native parameter field rules", () => {
  const animation = fakeAnimation();
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => animation,
  });
  runtime.statuses.set("AKIR", 0xf);
  const token = runtime.beginTransaction();
  assert.equal(runtime.requestMotion({
    actorCode: "AKIR",
    request: 0x10387,
    parameters: [2.5, 0, 0, -3],
  }), true);
  assert.equal(runtime.readMotionStatus({ actorCode: "AKIR" }), 0xd);
  assert.deepEqual(runtime.readControllerState(), {
    requestWord66: 0x387,
    parameter12c: 0,
    parameter130: 0,
    parameter134: -1,
    parameterDc: -3,
  });
  runtime.rollbackTransaction(token);
});

test("owns exact selector-one availability and transactional controller bit 3", () => {
  const runtime = createNativePlayerScriptedMotionRuntime({
    getAnimation: () => fakeAnimation(),
  });
  assert.equal(runtime.readControllerStatus({
    actorCode: "AKIR",
    selector: 1,
  }), undefined);
  const token = runtime.beginTransaction();
  assert.equal(runtime.readControllerStatus({
    actorCode: "AKIR",
    selector: 1,
  }), 1);
  assert.equal(runtime.readControllerStatus({
    actorCode: "AKIR",
    selector: 0,
  }), undefined);
  assert.equal(runtime.writeControllerFlagBit3({
    actorCode: "AKIR",
    enabled: true,
  }), true);
  assert.equal(runtime.readControllerState().controllerFlagsDword5c, 8);
  assert.equal(runtime.writeControllerFlagBit3({
    actorCode: "AKIR",
    enabled: false,
  }), true);
  assert.equal(runtime.readControllerState().controllerFlagsDword5c, 0);
  runtime.rollbackTransaction(token);
  assert.equal(runtime.readControllerState(), undefined);
});
