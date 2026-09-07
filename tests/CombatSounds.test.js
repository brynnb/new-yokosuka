import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { CombatSounds } from "../play/audio/CombatSounds.js";
import {
  NATIVE_COMBAT_SOUND_CUES,
} from "../play/data/native-combat-sound-cues.js";

function harness(preferenceOverrides = {}) {
  const played = [];
  const created = [];
  let preferenceListener = null;
  const state = {
    overallVolume: 0.8,
    effectsVolume: 0.5,
    effectsMuted: false,
    masterMuted: false,
    ...preferenceOverrides,
  };
  const sounds = new CombatSounds({
    preferences: {
      getState: () => state,
      subscribe(listener) {
        preferenceListener = listener;
        return () => { preferenceListener = null; };
      },
    },
    cueData: {
      banks: {
        global: {
          sequences: {
            punch: [
              { frame: 0, commandHex: "ab760100" },
              { frame: 3, commandHex: "ab761900" },
              { frame: 8, commandHex: "ab762700" },
            ],
          },
        },
      },
    },
    audioFactory(source) {
      const audio = {
        source,
        muted: false,
        volume: 0,
        addEventListener() {},
        play() {
          played.push({ source: this.source, volume: this.volume });
          return Promise.resolve();
        },
        pause() {},
      };
      created.push(audio);
      return audio;
    },
  });
  return {
    sounds,
    played,
    created,
    state,
    emitPreferences: () => preferenceListener?.(state),
  };
}

test("combat sounds cross exact native 30 Hz cue frames once", () => {
  const { sounds, played } = harness();
  assert.equal(sounds.start("ryo", {
    bank: "global",
    sequence: "punch",
  }), true);
  assert.deepEqual(played.map((entry) => entry.source), [
    "/audio/combat/ab760100.webm",
  ]);
  sounds.update(2 / 30);
  assert.equal(played.length, 1);
  sounds.update(1 / 30);
  assert.equal(played[1].source, "/audio/combat/ab761900.webm");
  sounds.update(5 / 30);
  assert.equal(played[2].source, "/audio/combat/ab762700.webm");
  sounds.update(1);
  assert.equal(played.length, 3);
});

test("combat sounds follow shared effect and master preferences", () => {
  const { sounds, played, created, state, emitPreferences } = harness();
  sounds.start("ryo", { bank: "global", sequence: "punch" });
  assert.equal(played[0].volume, 0.5 * 0.35 * 0.8);
  assert.equal(created[0].muted, false);
  state.effectsMuted = true;
  emitPreferences();
  assert.equal(created[0].muted, true);
  sounds.start("chai", { bank: "global", sequence: "punch" });
  assert.equal(played.length, 1);
  state.effectsMuted = false;
  state.masterMuted = true;
  sounds.start("chai", { bank: "global", sequence: "punch" });
  assert.equal(played.length, 1);
});

test("restarting a fighter timeline cannot replay stale cues", () => {
  const { sounds, played } = harness();
  sounds.start("ryo", { bank: "global", sequence: "punch" });
  sounds.update(3 / 30);
  sounds.start("ryo", { bank: "global", sequence: "missing" });
  sounds.update(1);
  assert.deepEqual(played.map((entry) => entry.source), [
    "/audio/combat/ab760100.webm",
    "/audio/combat/ab761900.webm",
  ]);
});

test("every native combat cue resolves to a playable BATTLE_1 track", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../public/audio/combat/manifest.json", import.meta.url),
  ));
  assert.equal(manifest.schema, "new-yokosuka-combat-audio-v3");
  assert.deepEqual(
    {
      container: manifest.source.encoder.container,
      codec: manifest.source.encoder.codec,
      bitRate: manifest.source.encoder.bitRate,
    },
    {
      container: "webm",
      codec: "opus",
      bitRate: 48_000,
    },
  );
  assert.equal(manifest.playbackCount, 70);
  assert.equal(manifest.uniqueDecodedSampleCount, 67);
  const playable = new Set(manifest.groups.flatMap(
    (group) => group.tracks.filter(
      (track) => track.playable,
    ).map((track) => track.commandHex),
  ));
  assert.equal(playable.size, 70);
  assert.equal(
    NATIVE_COMBAT_SOUND_CUES.soundBank.playableCommandCount,
    playable.size,
  );
  const used = new Set();
  for (const bank of Object.values(NATIVE_COMBAT_SOUND_CUES.banks)) {
    for (const cues of Object.values(bank.sequences)) {
      for (const cue of cues) {
        used.add(cue.commandHex);
        assert.ok(playable.has(cue.commandHex), cue.commandHex);
        assert.ok(existsSync(new URL(
          `../public/audio/combat/${cue.commandHex}.webm`,
          import.meta.url,
        )));
      }
    }
  }
  assert.ok(used.size > 30);
});
