import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeCutsceneMusicRuntime,
} from "../play/cutscenes/NativeCutsceneMusicRuntime.js";
import { createNativeOperation015cSemanticHandlers } from "../play/events/NativeOperation015cRuntime.js";
import op00Audio from "../public/audio/world/op00/manifest.json" with { type: "json" };

test("native named audio commands, not guessed shot slots, start opening scores", async () => {
  const calls = [];
  const runtime = musicRuntime(op00Audio.music, calls);
  const handler = createNativeOperation015cSemanticHandlers()["native-operation-015c-named-controller-acquire"];
  const start = name => handler({ action: { arguments: [{ kind: "static-pointer" }, { kind: "constant" }] },
    readArgument: index => index === 0 ? 123 : 0,
    context: { resolveNativeStaticString: () => name, playNativeNamedAudio: name => runtime.beginNamedCue(name) } });
  assert.equal((await start("OPEN1")).result, 1);
  for (const slot of [0, 1, 2, 3]) {
    runtime.beginActivity({ slot });
    runtime.endActivity({ programActive: true });
  }
  assert.deepEqual(calls, [["play", "op00-open1", { gain: 1, loop: false }]]);
  assert.equal((await start("OPEN2")).result, 2);
  assert.equal((await start("MISSING")).status, "stopped");
  runtime.reset();
});

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

test("slot cues replace a package soundtrack and retrigger only on a new cue", () => {
  const calls = [];
  const runtime = musicRuntime([
    { startActivity: true, trackId: "soundtrack", loop: true },
    { activitySlot: 1, trackId: "shot", loop: false },
  ], calls);
  runtime.beginActivity({ slot: 0 });
  runtime.endActivity({ programActive: true });
  runtime.beginActivity({ slot: 1 });
  runtime.endActivity({ programActive: true });
  assert.equal(runtime.trackId, "shot");
  assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
  runtime.beginActivity({ slot: 1 });
  assert.deepEqual(calls.filter(([kind]) => kind !== "pause"), [
    ["play", "soundtrack", { gain: 1, loop: true }],
    ["stop", "soundtrack"],
    ["play", "shot", { gain: 1, loop: false }],
    ["stop", "shot"],
    ["play", "shot", { gain: 1, loop: false }],
  ]);
});

test("slot-triggered scores survive uncued activities until replacement or program release", () => {
  const calls = [];
  const runtime = musicRuntime([
    { activitySlot: 1, trackId: "arrival" },
    { activitySlot: 4, trackId: "dojo" },
  ], calls);
  for (const slot of [1, 2, 3]) {
    runtime.beginActivity({ slot });
    runtime.endActivity({ programActive: true });
    assert.equal(runtime.trackId, "arrival");
  }
  assert.deepEqual(calls, [["play", "arrival", { gain: 1, loop: false }]]);
  runtime.beginActivity({ slot: 4 });
  runtime.endActivity({ programActive: true });
  runtime.beginActivity({ slot: 18 });
  assert.equal(runtime.trackId, "dojo");
  runtime.reset();
  assert.deepEqual(calls.filter(([kind]) => kind !== "pause"), [
    ["play", "arrival", { gain: 1, loop: false }],
    ["stop", "arrival"],
    ["play", "dojo", { gain: 1, loop: false }],
    ["stop", "dojo"],
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
