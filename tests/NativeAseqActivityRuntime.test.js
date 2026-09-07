import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createNativeAseqActivityRuntime,
  NativeAseqActivityCatalog,
} from "../play/events/NativeAseqActivityRuntime.js";
import {
  enrichNativeAseqActivityFrames,
  validateNativeAseqActivityMetadata,
} from "../play/events/NativeAseqActivityCommands.js";
import {
  createNativeAseqPresentationRuntime,
} from "../play/events/NativeAseqPresentationRuntime.js";

const manifest = JSON.parse(
  fs.readFileSync("play/assets/dobuita/drauth/manifest.json", "utf8"),
);
const audioManifest = JSON.parse(
  fs.readFileSync("public/audio/world/drauth/manifest.json", "utf8"),
);
const busManifest = JSON.parse(
  fs.readFileSync("play/assets/dobuita/buss/manifest.json", "utf8"),
);
const busAudioManifest = JSON.parse(
  fs.readFileSync("public/audio/world/buss/manifest.json", "utf8"),
);
const op02Manifest = JSON.parse(
  fs.readFileSync("play/assets/introduction/op02/manifest.json", "utf8"),
);

function harness({ rejectFrame = null } = {}) {
  const calls = [];
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifest,
    loadAsset: path => fs.readFileSync(path),
    presentation: {
      prepare: detail => {
        calls.push(["prepare", detail]);
        return true;
      },
      beginActivity: detail => {
        calls.push(["begin", detail]);
        return Object.freeze({ owner: detail.activityId });
      },
      advanceActivity: detail => {
        calls.push(["advance", detail]);
        return detail.currentFrame !== rejectFrame;
      },
      endActivity: detail => {
        calls.push(["end", detail]);
        return true;
      },
    },
  });
  return { runtime, calls };
}

test("canonical AUTH activities enrich every native presentation cue", () => {
  const vectors = Array.from({ length: 19 }, (_, index) => [index, 0, 0]);
  const metadata = validateNativeAseqActivityMetadata({
    actorTags: ["AKIR", "IWAO"],
    nativeHandPoseTables: { "0x100": { vectors } },
  });
  const frames = enrichNativeAseqActivityFrames({
    record: {
      activityId: "OP00/SEQDATA0.AUTH",
      durationFrames: 10,
      nativeHandPoseCues: [{
        frame: 1, actorTag: "AKIR", side: "right", durationNativeTicks: 2,
        poseTableOffset: "0x100", callFileOffset: "0x10",
      }],
      nativeBodyHandPoseCues: [{
        frame: 2, actorTag: "AKIR", channel: 1, targetIndex: 3,
        durationNativeTicks: 4, callFileOffset: "0x20",
      }],
      nativeDetailedHandDefaults: [{
        actorTag: "AKIR", sides: ["left", "right"],
        sourceFunction: "0x100", ownerCallFileOffset: "0x200",
      }],
      nativeFaceClipCues: [{
        frame: 3, actorTag: "IWAO", clipGroup: 2, selector: 1,
        durationNativeTicks: 5, callFileOffset: "0x30",
      }],
      nativeFaceControllerCues: [{
        frame: 3, actorTag: "IWAO", mode: 1,
        intervalNativeTicks: 2, parameter: 0, callFileOffset: "0x35",
      }],
      nativeFaceGazeCues: [{
        frame: 4, actorTag: "AKIR", mode: 2, durationNativeTicks: 6,
        target: {
          kind: "actor-component", actorTag: "IWAO", selector: -1,
          associated: true, offset: [0, 1, 0],
        },
        callFileOffset: "0x40",
      }, {
        frame: 10, actorTag: "AKIR", mode: 0, durationNativeTicks: 1,
        callFileOffset: "0x50",
      }],
    },
    sequence: { actors: ["AKIR"] },
    frames: [{ frame: 1, commands: [{ name: "camera" }] }],
    metadata,
  });
  assert.deepEqual(frames.map(frame => frame.frame), [0, 1, 2, 3, 4, 10]);
  assert.deepEqual(
    frames.flatMap(frame => frame.commands).map(command => command.name),
    [
      "detailed-hand-default", "camera", "hand-pose", "body-hand-pose",
      "face-clip", "face-controller", "face-gaze", "face-gaze",
    ],
  );
  assert.equal(frames[1].commands[1].vectors, vectors);
  assert.equal(frames.at(-1).commands[0].mode, 0);
});

test("AUTH activity lifecycle hooks bracket presentation ownership", async () => {
  const order = [];
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifest,
    loadAsset: path => fs.readFileSync(path),
    onActivityPreparing(record) {
      order.push(["activity-preparing", record.activityId]);
      return true;
    },
    onActivityStarted(record) {
      order.push(["activity-started", record.activityId]);
      return true;
    },
    onActivityAdvanced(record, frame) {
      order.push(["activity-advanced", record.activityId, frame]);
      return true;
    },
    onActivityStopped(record, reason) {
      order.push(["activity-stopped", record.activityId, reason]);
      return true;
    },
    presentation: {
      prepare() { order.push(["presentation-prepare"]); return true; },
      beginActivity() { order.push(["presentation-begin"]); return {}; },
      advanceActivity() { return true; },
      endActivity() { return true; },
    },
  });
  const activity = await runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  });
  assert.deepEqual(order.map(([kind]) => kind), [
    "activity-preparing",
    "presentation-prepare",
    "presentation-begin",
    "activity-started",
  ]);
  assert.equal(runtime.updateActivity({
    ...activity,
    previousFrame: 0,
    currentFrame: 1,
  }), true);
  assert.deepEqual(order.at(-1), [
    "activity-advanced",
    activity.activityId,
    1,
  ]);
  assert.equal(runtime.stopActivity({ reason: "complete", activity }), true);
  assert.deepEqual(order.at(-1), [
    "activity-stopped",
    activity.activityId,
    "complete",
  ]);
});

test("AUTH activity primes frame-one visual tracks without consuming audio", async () => {
  const { runtime, calls } = harness();
  await runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  });
  const detail = calls.find(([kind]) => kind === "begin")[1];
  assert.equal(detail.primedFrames.length, 1);
  assert.equal(detail.primedFrames[0].frame, 1);
  assert.ok(detail.primedFrames[0].commands.some(command => (
    command.name === "camera"
  )));
  assert.equal(detail.primedFrames[0].commands.every(command => (
    command.name === "camera"
    || command.name === "move"
    || command.name === "motion"
  )), true);
  assert.equal(detail.primedFrames[0].commands.some(command => (
    command.name === "voice" || command.name === "sound"
  )), false);
});

test("AUTH activity packages prewarm every shot before playback", async () => {
  const loaded = [];
  const prepared = [];
  const hooks = [];
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifest,
    loadAsset(path) {
      loaded.push(path);
      return fs.readFileSync(path);
    },
    onActivityPreparing(record) {
      hooks.push(record.activityId);
      return true;
    },
    presentation: {
      prepare(detail) {
        prepared.push(detail.activityId);
        return true;
      },
      beginActivity() { return {}; },
      advanceActivity() { return true; },
      endActivity() { return true; },
    },
  });

  assert.equal(await runtime.prepareAllActivities(), true);
  assert.deepEqual(
    prepared,
    manifest.activities.map(activity => activity.activityId),
  );
  assert.deepEqual(hooks, []);
  const loadedBeforePlayback = [...loaded];

  const selected = manifest.activities[1];
  await runtime.startActivity({
    slot: selected.slot,
    binding: {
      primaryPointer: selected.primaryPointer,
      secondaryPointer: selected.secondaryPointer,
    },
  });

  assert.deepEqual(loaded, loadedBeforePlayback);
  assert.equal(
    prepared.filter(activityId => activityId === selected.activityId).length,
    1,
  );
  assert.deepEqual(hooks, [selected.activityId]);
});

test("AUTH activity cleans acquired presentation when its started hook rejects", async () => {
  const ended = [];
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifest,
    loadAsset: path => fs.readFileSync(path),
    onActivityStarted: () => false,
    presentation: {
      beginActivity() { return {}; },
      advanceActivity() { return true; },
      endActivity(detail) { ended.push(detail); return true; },
    },
  });
  await assert.rejects(() => runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  }), /start was rejected/);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].reason, "activity-start-failed");
});

test("AUTH activity catalog resolves only the exact native slot and pointer pair", () => {
  const catalog = new NativeAseqActivityCatalog(manifest);
  assert.equal(catalog.has({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  }), true);
  assert.equal(catalog.has({
    slot: 0,
    binding: { primaryPointer: 0xb1392, secondaryPointer: 0xb1399 },
  }), false);
  assert.equal(catalog.has({ slot: 0, binding: null }), false);
  assert.equal(catalog.resolve({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  }).activityId, "DRAUTH/SEQDATA1.AUTH");
  assert.throws(() => catalog.resolve({
    slot: 0,
    binding: { primaryPointer: 0xb1392, secondaryPointer: 0xb1399 },
  }), /not catalogued/);
});

test("AUTH activity catalog resolves exact map-embedded slot identities", () => {
  const catalog = new NativeAseqActivityCatalog(op02Manifest);
  const binding = {
    kind: "map-embedded-slot",
    activityId: "OP02/SEQDATA0.AUTH",
  };
  assert.equal(catalog.has({ slot: 0, binding }), true);
  assert.equal(catalog.has({ slot: 1, binding }), false);
  assert.equal(catalog.resolve({ slot: 0, binding }).sourceOffset, 0x2894);
  assert.deepEqual(catalog.embeddedBindings()[0], {
    slot: 0,
    activityId: "OP02/SEQDATA0.AUTH",
  });
});

test("AUTH activity runtime loads exact resources and advances authored frames", async () => {
  const { runtime, calls } = harness();
  const started = await runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  });
  assert.deepEqual(started, {
    activityId: "DRAUTH/SEQDATA1.AUTH",
    slot: 0,
    binding: {
      primaryPointer: 0xb138a,
      secondaryPointer: 0xb1391,
    },
    durationFrames: 1330,
  });
  assert.equal(calls[0][0], "prepare");
  assert.equal(calls[1][0], "begin");
  assert.deepEqual(calls[1][1].actors, [
    "AKIR", "SMTH", "HARY", "TONY", "SERA", "JONZ",
  ]);
  assert.equal(calls[1][1].prepared.motions.length, 9);
  assert.ok(calls[1][1].prepared.motions.every(motion => motion.motionValid));

  assert.equal(runtime.updateActivity({
    ...started,
    slot: 0,
    previousFrame: 0,
    currentFrame: 1,
  }), true);
  const firstFrame = calls.find(([kind]) => kind === "advance")[1];
  assert.deepEqual(firstFrame.frames.map(frame => frame.frame), [1]);
  assert.deepEqual(
    firstFrame.frames[0].commands.map(command => command.name),
    ["camera", "move", "move", "move", "move", "move", "move", "motion", "motion"],
  );
  assert.ok(firstFrame.frames[0].commands.find(command => command.name === "camera").camera);
  assert.ok(firstFrame.frames[0].commands.find(command => command.name === "move").movement);
  assert.ok(firstFrame.frames[0].commands.find(command => command.name === "motion").motion.motionName);
  for (let frame = 2; frame <= 35; frame += 1) {
    assert.equal(runtime.updateActivity({
      ...started,
      slot: 0,
      previousFrame: frame - 1,
      currentFrame: frame,
    }), true);
  }
  const audioCommands = calls
    .filter(([kind]) => kind === "advance")
    .flatMap(([, detail]) => detail.frames)
    .flatMap(frame => frame.commands)
    .filter(command => command.name === "sound" || command.name === "voice");
  assert.deepEqual(audioCommands.map(command => command.audio.kind), [
    "sound", "sound", "voice",
  ]);
  assert.ok(audioCommands.every(command => command.audio.assetUrl.startsWith("/audio/")));
  assert.equal(runtime.stopActivity({ reason: "complete", activity: started }), true);
  assert.equal(calls.at(-1)[0], "end");
  assert.equal(calls.at(-1)[1].reason, "complete");
});

test("AUTH activity runtime fails closed and cleans presentation on a rejected frame", async () => {
  const { runtime, calls } = harness({ rejectFrame: 1 });
  const started = await runtime.startActivity({
    slot: 1,
    binding: { primaryPointer: 0xb1392, secondaryPointer: 0xb1399 },
  });
  assert.equal(runtime.updateActivity({
    ...started,
    slot: 1,
    previousFrame: 0,
    currentFrame: 1,
  }), false);
  assert.equal(calls.at(-1)[0], "end");
  assert.equal(calls.at(-1)[1].reason, "presentation-failed");
  assert.match(runtime.lastUpdateError?.message, /rejected a frame/);
  assert.equal(runtime.rollbackActivity(), true);
});

test("AUTH activity runtime rejects same-length modified source assets", async () => {
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifest,
    loadAsset: path => {
      const bytes = fs.readFileSync(path);
      if (path.endsWith("SEQDATA1.AUTH")) bytes[100] ^= 1;
      return bytes;
    },
    presentation: {
      beginActivity() { return {}; },
      advanceActivity() { return true; },
      endActivity() { return true; },
    },
  });
  await assert.rejects(() => runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  }), /SHA-256 changed/);
});

test("AUTH activity runtime selects audio catalogs by native activity slot", async () => {
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifests: [{ activitySlot: 0, manifest: audioManifest }],
    loadAsset: path => fs.readFileSync(path),
    presentation: {
      beginActivity() { return {}; },
      advanceActivity() { return true; },
      endActivity() { return true; },
    },
  });
  const activity = await runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  });
  assert.equal(activity.activityId, "DRAUTH/SEQDATA1.AUTH");
  assert.equal(runtime.stopActivity({ reason: "complete", activity }), true);
  await assert.rejects(() => runtime.startActivity({
    slot: 1,
    binding: { primaryPointer: 0xb1392, secondaryPointer: 0xb1399 },
  }), /audio catalog is unavailable/);
});

test("AUTH activity runtime rollback ends the exact owned presentation", async () => {
  const { runtime, calls } = harness();
  await runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  });
  assert.equal(runtime.rollbackActivity("event-cancelled"), true);
  assert.equal(calls.at(-1)[1].reason, "event-cancelled");
});

test("the complete first DRAUTH sequence crosses the reusable presentation boundary", async () => {
  const counts = { transforms: 0, motions: 0, cameras: 0, audio: 0 };
  const presentation = createNativeAseqPresentationRuntime({
    actors: {
      begin: () => true,
      applyTransform: () => (counts.transforms += 1, true),
      applyMotion: () => (counts.motions += 1, true),
      end: () => true,
    },
    camera: {
      begin: () => true,
      apply: () => (counts.cameras += 1, true),
      end: () => true,
    },
    audio: {
      begin: () => true,
      play: () => (counts.audio += 1, true),
      end: () => true,
    },
  });
  const runtime = createNativeAseqActivityRuntime({
    manifest,
    audioManifest,
    loadAsset: path => fs.readFileSync(path),
    presentation,
  });
  const activity = await runtime.startActivity({
    slot: 0,
    binding: { primaryPointer: 0xb138a, secondaryPointer: 0xb1391 },
  });
  for (let frame = 1; frame <= activity.durationFrames; frame += 1) {
    assert.equal(runtime.updateActivity({
      ...activity,
      slot: 0,
      previousFrame: frame - 1,
      currentFrame: frame,
    }), true, `frame ${frame}`);
  }
  assert.equal(runtime.stopActivity({ reason: "complete", activity }), true);
  assert.equal(counts.transforms, activity.durationFrames * 6 + 6);
  assert.equal(counts.cameras, activity.durationFrames + 1);
  assert.ok(counts.motions > activity.durationFrames);
  assert.equal(counts.audio, 44);
});

test("all BUSS branches resolve shared motion, sound-only audio, and cleanup", async () => {
  for (const expected of busManifest.activities) {
    const calls = [];
    const runtime = createNativeAseqActivityRuntime({
      manifest: busManifest,
      audioManifest: busAudioManifest,
      loadAsset: sourcePath => (
        sourcePath === "/motion/MOTION.BIN"
          ? fs.readFileSync(".disc-work/runtime-motion/MOTION.BIN")
          : fs.readFileSync(sourcePath)
      ),
      presentation: {
        prepare(detail) { calls.push(["prepare", detail]); return true; },
        beginActivity(detail) { calls.push(["begin", detail]); return {}; },
        advanceActivity(detail) { calls.push(["advance", detail]); return true; },
        endActivity(detail) { calls.push(["end", detail]); return true; },
      },
    });
    const activity = await runtime.startActivity({
      slot: expected.slot,
      binding: {
        primaryPointer: expected.primaryPointer,
        secondaryPointer: expected.secondaryPointer,
      },
    });
    for (let frame = 1; frame <= activity.durationFrames; frame += 1) {
      assert.equal(runtime.updateActivity({
        ...activity,
        slot: expected.slot,
        previousFrame: frame - 1,
        currentFrame: frame,
      }), true, `${expected.archiveMember} frame ${frame}`);
    }
    assert.equal(runtime.stopActivity({ reason: "complete", activity }), true);
    const begin = calls.find(([kind]) => kind === "begin")[1];
    assert.ok(begin.prepared.motions.every(motion => motion.motionValid));
    const audio = calls.filter(([kind]) => kind === "advance")
      .flatMap(([, detail]) => detail.frames)
      .flatMap(frame => frame.commands)
      .filter(command => command.name === "sound");
    assert.equal(audio.length, expected.commandCounts.sound);
    assert.ok(audio.every(command => command.audio.assetUrl.startsWith("/audio/")));
    assert.equal(calls.at(-1)[0], "end");
    assert.equal(calls.at(-1)[1].reason, "complete");
  }
});
