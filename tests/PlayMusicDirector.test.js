import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAY_MUSIC_MUTED_STORAGE_KEY,
  PLAY_MUSIC_VOLUME_STORAGE_KEY,
  PlayMusicDirector,
  readMusicPreferences,
} from "../play/audio/MusicDirector.js";

const manifest = {
  tracks: {
    home: { url: "/home.ogg", label: "Home", loop: true },
    town: { url: "/town.ogg", label: "Town", loop: true },
  },
  worlds: {
    "account-menu": { track: "home", gain: 0.68 },
    interior: { track: "home", gain: 0.8 },
    exterior: { track: "town", gain: 0.5 },
    race: { track: "town", gain: 0.7 },
  },
};

function harness() {
  const audio = [];
  const frames = [];
  let clock = 0;
  const storageValues = new Map();
  const director = new PlayMusicDirector({
    audioFactory() {
      const element = {
        src: "",
        loop: false,
        muted: false,
        volume: 0,
        playCalls: 0,
        pauseCalls: 0,
        play() {
          this.playCalls++;
          return Promise.resolve();
        },
        pause() {
          this.pauseCalls++;
        },
        removeAttribute() {},
      };
      audio.push(element);
      return element;
    },
    storage: {
      getItem: (key) => storageValues.get(key) ?? null,
      setItem: (key, value) => storageValues.set(key, value),
    },
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame() {},
    now: () => clock,
    crossfadeMs: 100,
  });
  return {
    director,
    audio,
    storageValues,
    advance(milliseconds) {
      clock += milliseconds;
      const callbacks = frames.splice(0);
      callbacks.forEach((callback) => callback());
    },
  };
}

test("waits for a user gesture before starting the selected world", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  assert.equal(audio.length, 0);
  director.unlock();
  assert.equal(audio.length, 1);
  assert.equal(audio[0].src, "/home.ogg");
  assert.equal(audio[0].playCalls, 1);
  advance(100);
  assert.equal(audio[0].volume, 0.55 * 0.8);
});

test("main menu music follows the background music slider", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("account-menu");
  director.unlock();
  advance(100);
  assert.equal(audio[0].volume, 0.55 * 0.68);
  director.setVolume(0.25);
  assert.equal(audio[0].volume, 0.25 * 0.68);
});

test("crossfades map changes and does not restart a shared track", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);
  director.setWorld("exterior");
  assert.equal(audio.length, 2);
  advance(50);
  assert.equal(audio[0].volume, 0.55 * 0.8 * 0.5);
  assert.equal(audio[1].volume, 0.55 * 0.5 * 0.5);
  advance(50);
  assert.equal(audio[0].pauseCalls, 1);
  director.setWorld("race");
  assert.equal(audio.length, 2);
  assert.equal(audio[1].volume, 0.55 * 0.7);
});

test("an unassigned gameplay world stops menu music", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("account-menu");
  director.unlock();
  advance(100);
  director.setWorld("silent-map");
  assert.equal(audio[0].pauseCalls, 1);
  assert.equal(director.getState().playing, false);
  assert.equal(director.getState().worldId, "silent-map");
  assert.equal(director.getState().trackId, null);
});

test("persists volume and mute preferences", () => {
  const { director, storageValues } = harness();
  director.setVolume(0.25);
  director.setMuted(true);
  assert.equal(storageValues.get(PLAY_MUSIC_VOLUME_STORAGE_KEY), "0.25");
  assert.equal(storageValues.get(PLAY_MUSIC_MUTED_STORAGE_KEY), "1");
  assert.deepEqual(
    readMusicPreferences({
      getItem: (key) => storageValues.get(key),
    }),
    { volume: 0.25, muted: true },
  );
});

test("mute silences both sides of an active crossfade", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);
  director.setWorld("exterior");
  advance(50);
  director.setMuted(true);
  assert.equal(audio[0].volume, 0);
  assert.equal(audio[1].volume, 0);
  assert.equal(audio[0].muted, true);
  assert.equal(audio[1].muted, true);
  advance(25);
  assert.equal(audio[0].volume, 0);
  assert.equal(audio[1].volume, 0);
  assert.equal(audio[0].muted, true);
  assert.equal(audio[1].muted, true);
});

test("master mute is reversible without changing the music preference", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);
  assert.equal(audio[0].volume, 0.55 * 0.8);

  director.setMasterMuted(true);
  assert.equal(audio[0].volume, 0);
  assert.equal(audio[0].muted, true);
  assert.equal(director.getState().muted, false);
  director.setMasterMuted(false);
  assert.equal(audio[0].volume, 0.55 * 0.8);
  assert.equal(audio[0].muted, false);
  director.setOverallVolume(0.5);
  assert.equal(audio[0].volume, 0.55 * 0.8 * 0.5);
});

test("music applies native mute before starting playback", () => {
  let mutedWhenPlayed = false;
  const element = {
    muted: false,
    volume: 1,
    play() {
      mutedWhenPlayed = this.muted;
      return Promise.resolve();
    },
    pause() {},
    removeAttribute() {},
  };
  const director = new PlayMusicDirector({
    audioFactory: () => element,
    initialMuted: true,
    persistPreferences: false,
    crossfadeMs: 0,
    now: () => 0,
  });
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();

  assert.equal(mutedWhenPlayed, true);
  assert.equal(element.muted, true);
  assert.equal(element.volume, 0);
});

test("cutscene transport pauses and resumes music playback", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);

  assert.equal(director.setPlaybackPaused(true), true);
  assert.equal(audio[0].pauseCalls, 1);
  assert.equal(director.getState().playbackPaused, true);
  assert.equal(director.setPlaybackPaused(false), true);
  assert.equal(audio[0].playCalls, 2);
  assert.equal(director.getState().playbackPaused, false);
});

test("temporary music plays once and then resumes the current world", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);

  assert.equal(director.playTemporaryTrack("town", { gain: 0.6 }), true);
  assert.equal(audio[1].src, "/town.ogg");
  assert.equal(audio[1].loop, false);
  advance(100);
  audio[1].onended();

  assert.equal(audio.length, 3);
  assert.equal(audio[2].src, "/home.ogg");
  assert.equal(audio[2].loop, true);
  assert.equal(director.getState().trackId, "home");
});

test("an owned temporary track can be stopped before it ends", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);
  assert.equal(director.playTemporaryTrack("town"), true);
  advance(100);

  assert.equal(director.stopTemporaryTrack("home"), false);
  assert.equal(director.stopTemporaryTrack("town"), true);
  assert.equal(audio[1].pauseCalls, 1);
  assert.equal(audio[2].src, "/home.ogg");
  assert.equal(director.getState().trackId, "home");
});

test("eligible world changes preserve a cue while excluded worlds stop it", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);
  director.playTemporaryTrack("town");
  advance(100);

  director.setWorld("exterior", { preserveTemporary: true });
  assert.equal(audio.length, 2);
  assert.equal(audio[1].loop, false);

  director.setWorld("interior");
  assert.equal(audio.length, 3);
  assert.equal(audio[2].src, "/home.ogg");
  assert.equal(audio[2].loop, true);

  director.setWorld("exterior", { preserveTemporary: true });
  assert.equal(audio.length, 4);
  assert.equal(audio[3].src, "/town.ogg");
  assert.equal(audio[3].loop, true);
});

test("looping temporary music stops explicitly and resumes the world", () => {
  const { director, audio, advance } = harness();
  director.setManifest(manifest);
  director.setWorld("interior");
  director.unlock();
  advance(100);

  assert.equal(
    director.playTemporaryTrack("town", { gain: 0.6, loop: true }),
    true,
  );
  assert.equal(audio[1].loop, true);
  assert.equal(audio[1].onended, undefined);
  advance(100);

  assert.equal(director.stopTemporaryTrack("other-track"), false);
  assert.equal(director.stopTemporaryTrack("town"), true);
  assert.equal(audio.length, 3);
  assert.equal(audio[2].src, "/home.ogg");
  assert.equal(director.stopTemporaryTrack(), false);
});

test("validates world track references", () => {
  const { director } = harness();
  assert.throws(
    () => director.setManifest({
      tracks: {},
      worlds: { exterior: { track: "missing" } },
    }),
    /missing track/,
  );
});
