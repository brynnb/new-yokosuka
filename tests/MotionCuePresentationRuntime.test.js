import assert from "node:assert/strict";
import test from "node:test";

import {
  createMotionCuePresentationRuntime,
} from "../play/scripts/MotionCuePresentationRuntime.js";

function floatWord(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

function sequence(kind = "actor-motion-cue-start") {
  return kind === "actor-motion-cue-start" ? {
    kind,
    sequenceId: "d000.door.61.closed-check",
    area: "D000",
    actorCode: "AKIR",
    alignment: {
      target: [-19.15, 0.0724, 72.97],
      requestWord: 1820,
      requestDword: 594,
      stateSelector: 0,
    },
    motion: {
      actorCode: "AKIR",
      request: 28677,
      parameters: [-1, -1, 40, 1.2],
    },
    cues: [
      { phase: 58, commandHex: "a9054200" },
      { phase: 82, commandHex: "a9054200" },
    ],
    dialoguePhase: 150,
  } : {
    kind,
    sequenceId: "d000.door.61.closed-check",
    area: "D000",
  };
}

function harness({ nativeX = -18 } = {}) {
  let xmptState = 3;
  let phase = 0;
  let motionStatus = 0;
  const calls = [];
  const runtime = createMotionCuePresentationRuntime({
    xmptState: {
      requestActorXmpt: detail => {
        calls.push(["xmpt-request", detail]);
        xmptState = 3;
      },
      readActorXmptState: () => ({ state: xmptState }),
      updateActorXmpt: () => {
        calls.push(["xmpt-update"]);
        xmptState = 0;
      },
    },
    playerXmptRuntime: {
      update: delta => (calls.push(["player-xmpt-update", delta]), true),
      controller: () => ({}),
      currentTransform: () => ({ position: [nativeX, 0, 0], facingRaw: 0 }),
    },
    playerMotionRuntime: {
      requestMotion: detail => (calls.push(["motion", detail]), true),
      readMomtNumericWords: () => ({ floatWordF0: floatWord(phase) }),
      readMotionStatus: () => motionStatus,
    },
    playSound: cue => (calls.push(["sound", cue.phase ?? cue.tick]), true),
  });
  return {
    runtime,
    calls,
    setPhase: value => { phase = value; },
    completeMotion: () => { motionStatus = 2; },
  };
}

test("motion-cue sequence aligns, cues at MOMT phases, and joins completion", async () => {
  const h = harness();
  const owner = {};
  const started = h.runtime.play(sequence(), owner);
  h.runtime.update(owner, 1 / 30);
  assert.equal(h.calls.some(([name]) => name === "motion"), true);
  h.setPhase(58);
  h.runtime.update(owner, 1 / 30);
  assert.deepEqual(h.calls.filter(([name]) => name === "sound"), [
    ["sound", 58],
  ]);
  h.setPhase(150);
  h.runtime.update(owner, 1 / 30);
  assert.equal(await started, true);
  assert.deepEqual(h.calls.filter(([name]) => name === "sound"), [
    ["sound", 58], ["sound", 82],
  ]);
  const finished = h.runtime.play(
    sequence("actor-motion-cue-finish"),
    owner,
  );
  h.completeMotion();
  h.runtime.update(owner, 1 / 30);
  assert.equal(await finished, true);
  assert.equal(h.runtime.active, null);
});

test("motion-cue cancellation releases both pending acknowledgements", async () => {
  const h = harness();
  const owner = {};
  const started = h.runtime.play(sequence(), owner);
  assert.equal(h.runtime.cancel(owner), true);
  assert.equal(await started, false);
  assert.equal(h.runtime.active, null);
});

function sideAwareSequence(kind = "actor-motion-cue-start") {
  if (kind === "actor-motion-cue-finish") {
    return {
      kind,
      sequenceId: "d000.door.1.closed-check",
      area: "D000",
    };
  }
  return {
    kind,
    sequenceId: "d000.door.1.closed-check",
    area: "D000",
    actorCode: "AKIR",
    alignment: {
      selector: {
        kind: "native-actor-axis-threshold",
        actorCode: "AKIR",
        axis: "x",
        comparison: "greater-than",
        threshold: 0,
        whenTrue: {
          target: [-40.0338, 0.08, 74.6845],
          requestWord: 3276,
          requestDword: 0x00000612,
        },
        whenFalse: {
          target: [-40.9137, 0.08, 75.0331],
          requestWord: 3276,
          requestDword: 0x80000612,
        },
      },
      stateSelector: 0,
    },
    timing: {
      kind: "post-alignment-ticks",
      tickRate: 30,
      dialogueTick: 120,
    },
    cues: [
      { tick: 56, commandHex: "a9054200" },
      { tick: 78, commandHex: "a9054200" },
    ],
  };
}

test("side-aware sequence selects native-X route and uses scheduler tick delays", async () => {
  for (const [nativeX, expectedTarget, expectedDword] of [
    [1, [-40.0338, 0.08, 74.6845], 0x00000612],
    [0, [-40.9137, 0.08, 75.0331], 0x80000612],
  ]) {
    const h = harness({ nativeX });
    const owner = {};
    const started = h.runtime.play(sideAwareSequence(), owner);
    const request = h.calls.find(([name]) => name === "xmpt-request")[1];
    assert.deepEqual(request.target, expectedTarget);
    assert.equal(request.requestWord, 3276);
    assert.equal(request.requestDword, expectedDword);

    h.runtime.update(owner, 1 / 30);
    h.runtime.update(owner, 55 / 30);
    assert.deepEqual(h.calls.filter(([name]) => name === "sound"), []);
    h.runtime.update(owner, 1 / 30);
    assert.deepEqual(h.calls.filter(([name]) => name === "sound"), [["sound", 56]]);
    h.runtime.update(owner, 64 / 30);
    assert.equal(await started, true);
    assert.equal(h.calls.filter(([name]) => name === "sound").length, 2);
    assert.equal(h.runtime.play(
      sideAwareSequence("actor-motion-cue-finish"), owner,
    ), true);
    assert.equal(h.runtime.active, null);
  }
});
