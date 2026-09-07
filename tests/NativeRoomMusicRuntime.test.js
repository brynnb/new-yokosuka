import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeRoomMusicRuntime,
} from "../play/events/NativeRoomMusicRuntime.js";

test("native room music is transaction-owned and always cleaned up", () => {
  const calls = [];
  const runtime = createNativeRoomMusicRuntime({
    playTemporaryTrack: (trackId, options) => (
      calls.push(["play", trackId, options]), true
    ),
    stopTemporaryTrack: trackId => (
      calls.push(["stop", trackId]), true
    ),
  });
  const token = runtime.beginTransaction();
  assert.equal(runtime.playSequence("dobuita-selector-18"), true);
  assert.equal(runtime.playSequence("dobuita-selector-18"), false);
  assert.equal(runtime.endTransaction(token), true);
  assert.deepEqual(calls, [
    ["play", "dobuita-selector-18", { gain: 1 }],
    ["stop", "dobuita-selector-18"],
  ]);
});

test("native room music refuses playback without an active owner", () => {
  const runtime = createNativeRoomMusicRuntime({
    playTemporaryTrack: () => true,
    stopTemporaryTrack: () => true,
  });
  assert.equal(runtime.playSequence("dobuita-selector-18"), false);
  assert.equal(runtime.endTransaction({}), false);
});
