import assert from "node:assert/strict";
import test from "node:test";

import { MusicControls } from "../play/ui/MusicControls.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

test("music controls connect the manifest, world, preferences, and cleanup", async () => {
  const previousWindow = globalThis.window;
  const fakeWindow = new FakeEventTarget();
  globalThis.window = fakeWindow;
  const musicVolume = Object.assign(new FakeEventTarget(), {
    value: "0.55",
    disabled: false,
  });
  const musicMuted = Object.assign(new FakeEventTarget(), {
    checked: false,
    disabled: false,
  });
  const calls = [];
  const director = {
    getState: () => ({ volume: 0.4, muted: true }),
    setManifest: (manifest) => calls.push(["manifest", manifest]),
    setWorld: (worldId, options) => calls.push(["world", worldId, options]),
    setVolume: (volume) => calls.push(["volume", volume]),
    setMuted: (muted) => calls.push(["muted", muted]),
    playTemporaryTrack: (trackId) => calls.push(["temporary", trackId]),
    stopTemporaryTrack: (trackId) => calls.push(["stop-temporary", trackId]),
    setPlaybackPaused: paused => calls.push(["playback-paused", paused]),
    unlock: () => calls.push(["unlock"]),
    dispose: () => calls.push(["dispose"]),
  };
  const controls = new MusicControls({
    dom: {
      musicControls: { title: "" },
      musicVolume,
      musicMuted,
    },
    fetchManifest: async () => ({
      ok: true,
      json: async () => ({ tracks: {}, worlds: {} }),
    }),
    directorFactory: () => director,
    subscribeUserActivation: (callback) => {
      fakeWindow.addEventListener("pointerdown", callback);
      fakeWindow.addEventListener("keydown", callback);
      return () => {
        fakeWindow.removeEventListener("pointerdown", callback);
        fakeWindow.removeEventListener("keydown", callback);
      };
    },
  });

  try {
    assert.equal(musicVolume.value, "0.4");
    assert.equal(musicMuted.checked, true);
    await controls.initialize();
    controls.setWorld("dobuita", { preserveTemporary: true });
    controls.playTemporaryTrack("old-warehouse-district");
    controls.stopTemporaryTrack("old-warehouse-district");
    controls.setPlaybackPaused(true);
    musicVolume.value = "0.25";
    musicVolume.dispatch("input");
    musicMuted.checked = false;
    musicMuted.dispatch("change");
    fakeWindow.dispatch("pointerdown");
    controls.dispose();

    assert.deepEqual(calls, [
      ["manifest", { tracks: {}, worlds: {} }],
      ["world", "dobuita", { preserveTemporary: true }],
      ["temporary", "old-warehouse-district"],
      ["stop-temporary", "old-warehouse-district"],
      ["playback-paused", true],
      ["volume", "0.25"],
      ["muted", false],
      ["unlock"],
      ["dispose"],
    ]);
    assert.equal(fakeWindow.listeners.has("pointerdown"), false);
    assert.equal(musicVolume.listeners.has("input"), false);
    assert.equal(musicMuted.listeners.has("change"), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("music unlocks after an early menu gesture", async () => {
  const previousWindow = globalThis.window;
  const fakeWindow = new FakeEventTarget();
  globalThis.window = fakeWindow;
  const musicVolume = Object.assign(new FakeEventTarget(), {
    value: "0.55",
    disabled: false,
  });
  const musicMuted = Object.assign(new FakeEventTarget(), {
    checked: false,
    disabled: false,
  });
  let unlockCount = 0;
  const controls = new MusicControls({
    dom: {
      musicControls: { title: "" },
      musicVolume,
      musicMuted,
    },
    fetchManifest: async () => ({
      ok: true,
      json: async () => ({ tracks: {}, worlds: {} }),
    }),
    directorFactory: () => ({
      getState: () => ({ volume: 0.55, muted: false }),
      setManifest() {},
      unlock: () => { unlockCount += 1; },
      dispose() {},
    }),
    subscribeUserActivation: (callback) => {
      callback();
      return () => {};
    },
  });

  try {
    await controls.initialize();
    assert.equal(unlockCount, 1);
    assert.equal(fakeWindow.listeners.has("pointerdown"), false);
    assert.equal(fakeWindow.listeners.has("keydown"), false);
  } finally {
    controls.dispose();
    globalThis.window = previousWindow;
  }
});
