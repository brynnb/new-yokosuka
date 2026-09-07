import assert from "node:assert/strict";
import test from "node:test";

import { AmbientDirector } from "../play/audio/AmbientDirector.js";

function harness() {
  const audio = [];
  const frames = [];
  let clock = 0;
  const director = new AmbientDirector({
    manifest: {
      tracks: {
        home: { url: "/home.ogg", label: "Home", loop: true },
        town: { url: "/town.ogg", label: "Town", loop: true },
      },
      worlds: {
        interior: { track: "home", gain: 0.8 },
        exterior: { track: "town", gain: 0.5 },
      },
    },
    volume: 0.4,
    audioFactory() {
      const element = {
        src: "",
        volume: 0,
        play() { return Promise.resolve(); },
        pause() {},
        removeAttribute() {},
      };
      audio.push(element);
      return element;
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
    audio,
    director,
    advance(milliseconds) {
      clock += milliseconds;
      frames.splice(0).forEach((callback) => callback());
    },
  };
}

test("ambient playback waits for activation and crossfades world loops", () => {
  const { audio, director, advance } = harness();
  director.setWorld("interior");
  assert.equal(audio.length, 0);
  director.unlock();
  advance(100);
  assert.equal(audio[0].src, "/home.ogg");
  assert.equal(audio[0].volume, 0.4 * 0.8);

  director.setWorld("exterior");
  advance(100);
  assert.equal(audio[1].src, "/town.ogg");
  assert.equal(audio[1].volume, 0.4 * 0.5);
});

test("ambient volume and master mute remain independent of music storage", () => {
  const { audio, director, advance } = harness();
  director.setWorld("interior");
  director.unlock();
  advance(100);
  director.setVolume(0.25);
  assert.equal(audio[0].volume, 0.25 * 0.8);
  director.setMasterMuted(true);
  assert.equal(audio[0].volume, 0);
  director.setMasterMuted(false);
  assert.equal(audio[0].volume, 0.25 * 0.8);
});
