import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMediaElementAudio,
  setMediaElementMuted,
} from "../play/audio/MediaElementAudio.js";

test("HTML media mute is a native hard boundary independent of gain", () => {
  const media = { muted: false, volume: 1 };

  applyMediaElementAudio(media, { muted: true, volume: 0.75 });
  assert.deepEqual(media, { muted: true, volume: 0 });

  applyMediaElementAudio(media, { muted: false, volume: 0.75 });
  assert.deepEqual(media, { muted: false, volume: 0.75 });

  setMediaElementMuted(media, true);
  assert.equal(media.muted, true);
});
