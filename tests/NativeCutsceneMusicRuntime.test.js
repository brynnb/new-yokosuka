import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeCutsceneMusicRuntime,
} from "../play/cutscenes/NativeCutsceneMusicRuntime.js";

test("cutscene music selects exact activity-slot cues before a package fallback", () => {
  const calls = [];
  const runtime = createNativeCutsceneMusicRuntime({
    gain: 0.8,
    cues: [
      { activitySlot: 2, trackId: "bgm085", loop: true },
      { activitySlot: 3, trackId: "bgm049", loop: false },
      { startActivity: true, trackId: "fallback" },
    ],
  }, {
    playTemporaryTrack: (trackId, options) => (calls.push(["play", trackId, options]), true),
    stopTemporaryTrack: trackId => (calls.push(["stop", trackId]), true),
    setPlaybackPaused: paused => calls.push(["pause", paused]),
  });

  assert.equal(runtime.beginActivity({ slot: 2 }), true);
  assert.deepEqual(calls[0], ["play", "bgm085", { gain: 0.8, loop: true }]);
  assert.equal(runtime.beginActivity({ slot: 3 }), true);
  assert.deepEqual(calls.slice(1), [
    ["stop", "bgm085"],
    ["play", "bgm049", { gain: 0.8, loop: false }],
  ]);
});

function musicRuntime(cues, calls, play = () => true) {
  return createNativeCutsceneMusicRuntime({ cues }, {
    playTemporaryTrack: (trackId, options) => {
      calls.push(["play", trackId, options]);
      return play();
    },
    stopTemporaryTrack: trackId => (calls.push(["stop", trackId]), true),
    setPlaybackPaused: paused => calls.push(["pause", paused]),
  });
}

test("package soundtrack survives nested activity boundaries, then resets for replay", () => {
  const calls = [];
  const runtime = musicRuntime([{ startActivity: true, trackId: "soundtrack", loop: true }], calls);
  for (const slot of [0, 0, 1]) {
    assert.equal(runtime.beginActivity({ slot }), true);
    runtime.endActivity({ programActive: true });
  }
  assert.deepEqual(calls, [["play", "soundtrack", { gain: 1, loop: true }]]);
  runtime.reset();
  runtime.reset();
  assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
  assert.equal(runtime.beginActivity({ slot: 0 }), true);
  assert.equal(calls.filter(([kind]) => kind === "play").length, 2);
});

test("slot cues remain activity-owned and replace a package soundtrack", () => {
  const calls = [];
  const runtime = musicRuntime([
    { startActivity: true, trackId: "soundtrack", loop: true },
    { activitySlot: 1, trackId: "shot", loop: false },
  ], calls);
  runtime.beginActivity({ slot: 0 });
  runtime.endActivity({ programActive: true });
  runtime.beginActivity({ slot: 1 });
  runtime.endActivity({ programActive: true });
  runtime.beginActivity({ slot: 1 });
  assert.deepEqual(calls.filter(([kind]) => kind !== "pause"), [
    ["play", "soundtrack", { gain: 1, loop: true }],
    ["stop", "soundtrack"],
    ["play", "shot", { gain: 1, loop: false }],
    ["stop", "shot"],
    ["play", "shot", { gain: 1, loop: false }],
  ]);
});

test("standalone activity completion releases its package cue", () => {
  const calls = [];
  const runtime = musicRuntime([{ startActivity: true, trackId: "soundtrack" }], calls);
  runtime.beginActivity({ slot: 0 });
  runtime.endActivity();
  assert.deepEqual(calls.slice(1), [["stop", "soundtrack"], ["pause", false]]);
});

test("a rejected music start can retry without pretending to own a track", () => {
  const calls = [];
  let accepted = false;
  const runtime = musicRuntime([{ startActivity: true, trackId: "soundtrack" }], calls, () => accepted);
  assert.equal(runtime.beginActivity({ slot: 0 }), false);
  runtime.endActivity({ programActive: true });
  accepted = true;
  assert.equal(runtime.beginActivity({ slot: 0 }), true);
  runtime.reset();
  assert.equal(calls.filter(([kind]) => kind === "play").length, 2);
  assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
});
