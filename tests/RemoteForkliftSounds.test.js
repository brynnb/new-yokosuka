import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  RemoteForkliftSounds,
} from "../play/audio/RemoteForkliftSounds.js";
import {
  NATIVE_FORKLIFT_AUDIO,
} from "../play/audio/ForkliftSounds.js";

function harness(preferenceOverrides = {}) {
  const created = [];
  const preferences = {
    getState: () => ({
      overallVolume: 1,
      effectsVolume: 1,
      effectsMuted: false,
      masterMuted: false,
      ...preferenceOverrides,
    }),
  };
  const sounds = new RemoteForkliftSounds({
    scene: null,
    preferences,
    soundFactory(options) {
      let ended = null;
      const sound = {
        options,
        playCount: 0,
        stopCount: 0,
        disposed: false,
        position: options.position.clone(),
        volume: options.volume,
        onEndedObservable: {
          addOnce(listener) {
            ended = listener;
          },
        },
        play() {
          this.playCount += 1;
        },
        stop() {
          this.stopCount += 1;
        },
        dispose() {
          this.disposed = true;
        },
        setPosition(position) {
          this.position.copyFrom(position);
        },
        setVolume(volume) {
          this.volume = volume;
        },
        end() {
          ended?.();
        },
      };
      created.push(sound);
      return sound;
    },
  });
  return { sounds, created };
}

function snapshot(overrides = {}) {
  return {
    id: "forklift-2",
    position: new BABYLON.Vector3(1, 0, 2),
    signedSpeed: 0,
    lift: 0,
    tiltAngle: 0,
    ...overrides,
  };
}

test("remote forklift loops derive from replicated movement state", () => {
  const { sounds, created } = harness();
  sounds.update(0.1, [snapshot()]);
  assert.deepEqual(created.map(({ options }) => options.source), [
    NATIVE_FORKLIFT_AUDIO.engineIdle,
    NATIVE_FORKLIFT_AUDIO.engineMoving,
  ]);

  sounds.update(0.1, [snapshot({ signedSpeed: -2 })]);
  const reverse = created.find(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.reverse,
  );
  assert.equal(reverse.volume, 0.35 * 0.39);

  sounds.update(0.1, [snapshot({ lift: 0.2 })]);
  assert.ok(created.some(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.tinesUp.start,
  ));

  sounds.update(0.1, [snapshot({
    lift: 0.3,
    tiltAngle: 31 * Math.PI / 180,
  })]);
  assert.ok(created.some(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.flip,
  ));
  sounds.dispose();
});

test("remote backing alarms honor the forklift reverse mute", () => {
  const { sounds, created } = harness({ forkliftReverseMuted: true });
  sounds.update(0.1, [snapshot({ signedSpeed: -2 })]);
  assert.equal(created.some(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.reverse,
  ), false);
  sounds.dispose();
});

test("remote one-shot events are spatial and pending events wait for a pose", () => {
  const { sounds, created } = harness();
  assert.equal(sounds.playEvent({
    forkliftId: "forklift-2",
    cue: "horn",
  }), true);
  assert.equal(created.length, 0);
  sounds.update(0.1, [snapshot({
    position: new BABYLON.Vector3(7, 1, 9),
  })]);
  const horn = created.find(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.horn,
  );
  assert.deepEqual(horn.position.asArray(), [7, 1, 9]);
  assert.equal(horn.options.loop, false);
  assert.equal(horn.options.maxDistance, 48);
  sounds.dispose();
});

test("late-joining remote forklifts do not replay historical transitions", () => {
  const { sounds, created } = harness();
  sounds.update(0.1, [snapshot({
    lift: 2,
    tiltAngle: 85 * Math.PI / 180,
  })]);
  assert.equal(created.some(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.flip,
  ), false);
  assert.equal(created.some(
    ({ options }) => options.source === NATIVE_FORKLIFT_AUDIO.tinesUp.start,
  ), false);
  sounds.update(0.1, []);
  assert.ok(created
    .filter(({ options }) => options.loop)
    .every(({ disposed }) => disposed));
});
