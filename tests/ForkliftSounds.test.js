import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  ForkliftSounds,
  NATIVE_FORKLIFT_AUDIO,
} from "../play/audio/ForkliftSounds.js";

function harness(preferenceOverrides = {}) {
  const created = [];
  const networkCues = [];
  const state = {
    overallVolume: 0.8,
    effectsVolume: 0.5,
    effectsMuted: false,
    masterMuted: false,
    ...preferenceOverrides,
  };
  const sounds = new ForkliftSounds({
    preferences: { getState: () => state },
    onNetworkCue: (cue) => networkCues.push(cue),
    audioFactory(source) {
      const listeners = new Map();
      const audio = {
        source,
        volume: 0,
        currentTime: 0,
        loop: false,
        playCount: 0,
        pauseCount: 0,
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
        emit(type) {
          listeners.get(type)?.();
        },
        play() {
          this.playCount += 1;
          return Promise.resolve();
        },
        pause() {
          this.pauseCount += 1;
        },
      };
      created.push(audio);
      return audio;
    },
  });
  return { sounds, created, state, networkCues };
}

function sources(created) {
  return created.map(({ source }) => source);
}

test("forklift uses the manually identified startup and engine loops", () => {
  const { sounds, created } = harness();
  sounds.enter();
  assert.deepEqual(sources(created), [
    NATIVE_FORKLIFT_AUDIO.startup,
    NATIVE_FORKLIFT_AUDIO.engineIdle,
    NATIVE_FORKLIFT_AUDIO.engineMoving,
  ]);
  assert.equal(created[0].loop, false);
  assert.equal(created[1].loop, true);
  assert.equal(created[2].loop, true);
  const idleMovingVolume = created[2].volume;
  sounds.update(1 / 60, { speed: 9, throttle: 1 });
  assert.ok(created[1].volume < created[2].volume);
  assert.ok(created[2].volume > idleMovingVolume);

  sounds.exit();
  assert.equal(created.at(-1).source, NATIVE_FORKLIFT_AUDIO.shutdown);
  assert.equal(created.at(-1).loop, false);
});

test("reverse uses its continuous identified loop only while reversing", () => {
  const { sounds, created } = harness();
  sounds.update(1 / 60, { speed: -1, throttle: -1 });
  const reverse = created.find(
    ({ source }) => source === NATIVE_FORKLIFT_AUDIO.reverse,
  );
  assert.equal(reverse.loop, true);
  assert.equal(reverse.volume, 0.5 * 0.35 * 0.8 * 0.39);
  sounds.update(1 / 60, { speed: 1, throttle: 1 });
  assert.equal(reverse.pauseCount, 1);
});

test("reverse alarm mute stops and suppresses the backing loop", () => {
  const { sounds, created, state } = harness();
  sounds.update(1 / 60, { speed: -1, throttle: -1 });
  const reverse = created.find(
    ({ source }) => source === NATIVE_FORKLIFT_AUDIO.reverse,
  );
  state.forkliftReverseMuted = true;
  sounds.update(1 / 60, { speed: -1, throttle: -1 });
  assert.equal(reverse.pauseCount, 1);
  assert.equal(
    sources(created).filter(
      (source) => source === NATIVE_FORKLIFT_AUDIO.reverse,
    ).length,
    1,
  );
});

test("tines play the direction-specific start before the matching loop", () => {
  const { sounds, created } = harness();
  sounds.update(1 / 60, {
    lift: 1,
    liftPosition: 1,
    maximumLift: 3,
  });
  const upStart = created.find(
    ({ source }) => source === NATIVE_FORKLIFT_AUDIO.tinesUp.start,
  );
  assert.ok(upStart);
  assert.equal(
    sources(created).includes(NATIVE_FORKLIFT_AUDIO.tinesUp.loop),
    false,
  );
  upStart.emit("ended");
  assert.ok(sources(created).includes(NATIVE_FORKLIFT_AUDIO.tinesUp.loop));

  sounds.update(1 / 60, {
    lift: -1,
    liftPosition: 1,
    maximumLift: 3,
  });
  const downStart = created.find(
    ({ source }) => source === NATIVE_FORKLIFT_AUDIO.tinesDown.start,
  );
  assert.ok(downStart);
  downStart.emit("ended");
  assert.ok(sources(created).includes(NATIVE_FORKLIFT_AUDIO.tinesDown.loop));

  sounds.update(1 / 60, {
    lift: -1,
    liftPosition: 0,
    maximumLift: 3,
  });
  const downLoop = created.find(
    ({ source }) => source === NATIVE_FORKLIFT_AUDIO.tinesDown.loop,
  );
  assert.equal(downLoop.pauseCount, 1);
});

test("horn plays once per key press rather than repeating while held", () => {
  const { sounds, created, networkCues } = harness();
  sounds.update(1 / 60, { horn: true });
  sounds.update(1 / 60, { horn: true });
  assert.equal(
    sources(created).filter(
      (source) => source === NATIVE_FORKLIFT_AUDIO.horn,
    ).length,
    1,
  );
  sounds.update(1 / 60, { horn: false });
  sounds.update(1 / 60, { horn: true });
  assert.equal(
    sources(created).filter(
      (source) => source === NATIVE_FORKLIFT_AUDIO.horn,
    ).length,
    2,
  );
  assert.deepEqual(networkCues, ["horn", "horn"]);
});

test("flip cues follow the tilt threshold and subsequent ground impact", () => {
  const { sounds, created, networkCues } = harness();
  sounds.update(1 / 60, {
    tiltAngle: 29 * Math.PI / 180,
    groundImpactImpulse: 1200,
  });
  assert.equal(sources(created).includes(NATIVE_FORKLIFT_AUDIO.flip), false);
  sounds.update(1 / 60, {
    tiltAngle: 31 * Math.PI / 180,
    groundImpactImpulse: 0,
  });
  assert.equal(sources(created).includes(NATIVE_FORKLIFT_AUDIO.flip), true);
  assert.equal(
    sources(created).includes(NATIVE_FORKLIFT_AUDIO.flipImpact),
    false,
  );
  sounds.update(1 / 60, {
    tiltAngle: 60 * Math.PI / 180,
    groundImpactImpulse: 900,
  });
  assert.equal(
    sources(created).filter(
      (source) => source === NATIVE_FORKLIFT_AUDIO.flipImpact,
    ).length,
    1,
  );
  sounds.update(1 / 60, {
    tiltAngle: 85 * Math.PI / 180,
    groundImpactImpulse: 1200,
  });
  assert.equal(
    sources(created).filter(
      (source) => source === NATIVE_FORKLIFT_AUDIO.flipImpact,
    ).length,
    1,
  );
  assert.deepEqual(networkCues, ["flip_impact"]);
});

test("muting suppresses playback and live update preserves zero gain", () => {
  const { sounds, created, state } = harness({ effectsMuted: true });
  sounds.enter();
  assert.ok(created.every(({ playCount }) => playCount === 0));
  sounds.update(1 / 60, { speed: 5, throttle: 1 });
  assert.ok(created.every(({ volume }) => volume === 0));
  assert.ok(created.every(({ muted }) => muted === true));
  state.effectsMuted = false;
  sounds.update(1 / 60, { speed: 5, throttle: 1 });
  assert.ok(created.every(({ playCount }) => playCount === 1));
  assert.ok(created.every(({ muted }) => muted === false));
});

test("forklift manifest contains native start/stop evidence and assets", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../public/audio/forklift/manifest.json", import.meta.url),
  ));
  assert.equal(manifest.schema, "new-yokosuka-forklift-audio-v1");
  assert.equal(manifest.source.commandGroup, "a904");
  assert.deepEqual(
    [
      manifest.nativeRuntimeEvidence.engineLayerA.start,
      manifest.nativeRuntimeEvidence.engineLayerA.stop,
      manifest.nativeRuntimeEvidence.engineLayerB.start,
      manifest.nativeRuntimeEvidence.engineLayerB.stop,
    ],
    ["0x001104a9", "0x001204a9", "0x001304a9", "0x001404a9"],
  );
  for (const asset of manifest.assets) {
    assert.ok(existsSync(new URL(
      `../public/audio/forklift/${asset.filename}`,
      import.meta.url,
    )));
    if (asset.loop) {
      assert.ok(existsSync(new URL(
        `../public/audio/forklift/${asset.loop.filename}`,
        import.meta.url,
      )));
    }
  }
});
