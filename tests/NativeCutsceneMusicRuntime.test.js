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
