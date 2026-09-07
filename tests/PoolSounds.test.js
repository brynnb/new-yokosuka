import assert from "node:assert/strict";
import test from "node:test";

import { PoolSounds } from "../play/audio/PoolSounds.js";

test("pool sounds follow the shared effects and overall volume settings", () => {
  const created = [];
  let now = 100;
  const sounds = new PoolSounds({
    now: () => now,
    preferences: {
      getState: () => ({
        masterMuted: false,
        effectsMuted: false,
        effectsVolume: 0.8,
        overallVolume: 0.5,
      }),
    },
    audioFactory: (source) => {
      const audio = {
        source,
        volume: 0,
        addEventListener() {},
        play: () => Promise.resolve(),
        pause() {},
      };
      created.push(audio);
      return audio;
    },
  });

  assert.equal(sounds.impact(3), true);
  assert.equal(sounds.impact(3), false);
  now += 40;
  assert.equal(sounds.pocket(), true);
  assert.deepEqual(
    created.map((audio) => audio.source),
    [
      "/audio/pool/ball-impact.webm",
      "/audio/pool/ball-pocket.webm",
    ],
  );
  assert.equal(created[0].volume, 0.8 * 0.35 * 0.5);
  sounds.dispose();
});
