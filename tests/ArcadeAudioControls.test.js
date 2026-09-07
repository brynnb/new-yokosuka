import assert from "node:assert/strict";
import test from "node:test";
import { ArcadeAudioControls } from "../play/ui/ArcadeAudioControls.js";

class FakeControl {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.checked = false;
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

test("arcade background controls stay available with other preferences", () => {
  const volumeRow = new FakeControl();
  const volume = new FakeControl();
  const mutedRow = new FakeControl();
  const muted = new FakeControl();
  const tvVolume = new FakeControl();
  const tvMuted = new FakeControl();
  const calls = [];
  let state = {
    volume: 0.25,
    muted: true,
    tvVolume: 0.4,
    tvMuted: false,
  };
  const controls = new ArcadeAudioControls({
    dom: {
      arcadeBgVolumeRow: volumeRow,
      arcadeBgVolume: volume,
      arcadeBgMutedRow: mutedRow,
      arcadeBgMuted: muted,
      tvVolume,
      tvMuted,
    },
    runtime: {
      getAudioState: () => state,
      setVolume: (value) => calls.push(["volume", value]),
      setMuted: (value) => calls.push(["muted", value]),
      setTvVolume: (value) => calls.push(["tv-volume", value]),
      setTvMuted: (value) => calls.push(["tv-muted", value]),
      resetAudio: () => {
        state = {
          volume: 0.18,
          muted: false,
          tvVolume: 0.18,
          tvMuted: false,
        };
      },
    },
  });

  assert.equal(volume.value, "0.25");
  assert.equal(muted.checked, true);
  assert.equal(tvVolume.value, "0.4");
  assert.equal(tvMuted.checked, false);
  controls.setWorld("dobuita");
  assert.equal(volumeRow.hidden, false);
  controls.setWorld("arcade");
  assert.equal(volumeRow.hidden, false);
  volume.value = "0.4";
  volume.dispatch("input");
  muted.checked = false;
  muted.dispatch("change");
  tvVolume.value = "0.6";
  tvVolume.dispatch("input");
  tvMuted.checked = true;
  tvMuted.dispatch("change");
  assert.deepEqual(calls, [
    ["volume", "0.4"],
    ["muted", false],
    ["tv-volume", "0.6"],
    ["tv-muted", true],
  ]);
  controls.reset();
  assert.equal(volume.value, "0.18");
  assert.equal(muted.checked, false);
  assert.equal(tvVolume.value, "0.18");
  assert.equal(tvMuted.checked, false);
  controls.dispose();
});
