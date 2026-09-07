import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAseqPresentationRuntime,
} from "../play/events/NativeAseqPresentationRuntime.js";

function curve(value) {
  return Object.freeze({
    times: Object.freeze([0]),
    values: Object.freeze([value]),
    tangents: Object.freeze([0]),
  });
}

function harness(overrides = {}) {
  const calls = [];
  const runtime = createNativeAseqPresentationRuntime({
    actors: {
      begin: (_owner, actors) => (calls.push(["actors-begin", actors]), true),
      applyTransform: (_owner, actor, pose) => (
        calls.push(["transform", actor, pose]), true
      ),
      applyMotion: (_owner, actor, motion) => (
        calls.push(["motion", actor, motion]), true
      ),
      end: (_owner, reason) => (calls.push(["actors-end", reason]), true),
    },
    camera: {
      begin: () => (calls.push(["camera-begin"]), true),
      apply: (_owner, pose) => (calls.push(["camera", pose]), true),
      end: (_owner, reason) => (calls.push(["camera-end", reason]), true),
    },
    audio: {
      begin: () => (calls.push(["audio-begin"]), true),
      play: (_owner, command) => (calls.push(["audio", command.name]), true),
      end: (_owner, reason) => (calls.push(["audio-end", reason]), true),
    },
    ...overrides,
  });
  return { runtime, calls };
}

test("AUTH presentation reset clears retained cross-shot actor state", () => {
  const calls = [];
  const { runtime } = harness();
  runtime.actors.resetPresentationState = () => (
    calls.push("actors-reset"), true
  );
  assert.equal(runtime.reset(), true);
  assert.deepEqual(calls, ["actors-reset"]);
});

test("continuous AUTH programs retain detailed FACE ownership across shots", () => {
  const faceCalls = [];
  const faces = {
    prepare: () => true,
    beginProgram: (owner, actorTags) => (
      faceCalls.push(["program-begin", owner, actorTags]), true
    ),
    endProgram: owner => (faceCalls.push(["program-end", owner]), true),
    begin: (owner, actorTags) => (
      faceCalls.push(["activity-begin", owner, actorTags]), true
    ),
    play: () => true,
    apply: () => true,
    end: owner => (faceCalls.push(["activity-end", owner]), true),
  };
  const { runtime } = harness({ faces });
  const programOwner = {};
  assert.equal(runtime.beginProgram(programOwner, {
    continuousActivities: true,
    actorTags: ["SINF"],
  }), true);
  const firstOwner = runtime.beginActivity({
    activityId: "TEST/SHOT-1.AUTH",
    actors: ["SINF"],
    initialFrames: [],
  });
  assert.equal(runtime.endActivity({ owner: firstOwner, reason: "complete" }), true);
  const secondOwner = runtime.beginActivity({
    activityId: "TEST/SHOT-2.AUTH",
    actors: ["SINF"],
    initialFrames: [],
  });
  assert.equal(runtime.endActivity({ owner: secondOwner, reason: "complete" }), true);
  assert.equal(runtime.endProgram(programOwner), true);
  assert.deepEqual(faceCalls.map(([kind]) => kind), [
    "program-begin",
    "activity-begin",
    "activity-end",
    "activity-begin",
    "activity-end",
    "program-end",
  ]);
});

test("AUTH presentation applies authored frame time, command order, and motion phase", async () => {
  const { runtime, calls } = harness();
  const owner = await runtime.beginActivity({
    activityId: "TEST/ACTIVITY.AUTH",
    actors: ["AKIR", "SMTH"],
    initialFrames: [],
  });
  const movement = {
    channels: Object.fromEntries([
      ["x", 1], ["y", 2], ["z", 3],
      ["rotationX", 4], ["rotationY", 5], ["rotationZ", 6],
      ["faceX", 7], ["faceY", 8], ["faceZ", 9],
    ].map(([name, value]) => [name, curve(value)])),
  };
  const camera = {
    channels: Object.fromEntries([
      ["positionX", 10], ["positionY", 11], ["positionZ", 12],
      ["targetX", 13], ["targetY", 14], ["targetZ", 15],
      ["roll", 16], ["perspective", 55],
    ].map(([name, value]) => [name, curve(value)])),
  };
  const sequence = Object.freeze({ valid: true, valueData: { complete: true } });
  assert.equal(runtime.advanceActivity({
    owner,
    previousFrame: 0,
    currentFrame: 1,
    frames: [{
      frame: 1,
      commands: [
        { name: "camera", camera },
        { name: "move", actorTag: "AKIR", movement },
        {
          name: "motion",
          actorTag: "AKIR",
          motion: { sequence },
          startFrame: 26,
          endFrame: 140,
        },
        { name: "sound", audio: { assetUrl: "/sound.wav" } },
      ],
    }],
  }), true);
  assert.deepEqual(
    calls.find(call => call[0] === "transform").slice(1, 3),
    ["AKIR", {
      x: 1, y: 2, z: 3,
      rotationX: 4, rotationY: 5, rotationZ: 6,
      faceX: 7, faceY: 8, faceZ: 9,
    }],
  );
  assert.equal(calls.find(call => call[0] === "motion")[2].frame, 25);
  assert.equal(calls.find(call => call[0] === "camera")[1].perspective, 55);
  assert.ok(calls.find(call => call[0] === "audio"));

  assert.equal(runtime.advanceActivity({
    owner,
    previousFrame: 1,
    currentFrame: 2,
    frames: [],
  }), true);
  assert.equal(calls.filter(call => call[0] === "motion").at(-1)[2].frame, 26);
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
  assert.deepEqual(calls.slice(-3).map(call => call[0]), [
    "audio-end", "camera-end", "actors-end",
  ]);
});

test("AUTH presentation applies primed visual tracks before its first render", () => {
  const { runtime, calls } = harness();
  const movement = {
    channels: Object.fromEntries([
      ["x", 1], ["y", 2], ["z", 3],
      ["rotationX", 4], ["rotationY", 5], ["rotationZ", 6],
      ["faceX", 7], ["faceY", 8], ["faceZ", 9],
    ].map(([name, value]) => [name, curve(value)])),
  };
  const camera = {
    channels: Object.fromEntries([
      ["positionX", 10], ["positionY", 11], ["positionZ", 12],
      ["targetX", 13], ["targetY", 14], ["targetZ", 15],
      ["roll", 16], ["perspective", 55],
    ].map(([name, value]) => [name, curve(value)])),
  };
  const owner = runtime.beginActivity({
    activityId: "TEST/PRIMED.AUTH",
    actors: ["HAWK", "AKIR"],
    initialFrames: [],
    primedFrames: [{
      frame: 1,
      commands: [
        { name: "camera", camera },
        { name: "move", actorTag: "HAWK", movement },
      ],
    }],
  });
  assert.ok(calls.some(([kind]) => kind === "camera"));
  assert.ok(calls.some(([kind, actor]) => (
    kind === "transform" && actor === "HAWK"
  )));
  assert.equal(calls.some(([kind]) => kind === "audio"), false);
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
});

test("AUTH presentation routes native type-4 effects through FACE/CLIP", async () => {
  const calls = [];
  const { runtime } = harness({
    faces: {
      prepare: () => true,
      begin: () => true,
      play: (_owner, command) => (calls.push(command), true),
      apply: () => true,
      end: () => true,
    },
  });
  const owner = await runtime.beginActivity({
    activityId: "TEST/FACE-EFFECT.AUTH",
    actors: ["AKIR"],
    initialFrames: [],
  });
  assert.equal(runtime.advanceActivity({
    owner,
    previousFrame: 0,
    currentFrame: 1,
    frames: [{ frame: 1, commands: [{
      name: "effect",
      actorTag: "AKIR",
      effectType: 6,
      pattern: 2,
      speed: 0,
    }] }],
  }), true);
  assert.deepEqual(calls, [{
    name: "face-clip",
    actorTag: "AKIR",
    clipGroup: 6,
    selector: 2,
    durationNativeTicks: 1,
  }]);
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
});

test("AUTH presentation routes generic FACE controller and detailed HAND defaults", async () => {
  const calls = [];
  const { runtime } = harness({
    faces: {
      prepare: () => true,
      begin: () => true,
      play: (_owner, command) => (calls.push(["face", command]), true),
      apply: () => true,
      end: () => true,
    },
    hands: {
      prepare: () => true,
      begin: () => true,
      play: (_owner, command) => (calls.push(["hand", command]), true),
      apply: () => true,
      end: () => true,
    },
  });
  const owner = runtime.beginActivity({
    activityId: "TEST/NATIVE-CONTROLLERS.AUTH",
    actors: ["FUKU"],
    initialFrames: [{
      frame: 0,
      commands: [{
        name: "detailed-hand-default",
        actorTag: "FUKU",
        sides: ["left", "right"],
      }],
    }],
  });
  assert.equal(runtime.advanceActivity({
    owner,
    previousFrame: 0,
    currentFrame: 1,
    frames: [{ frame: 1, commands: [{
      name: "face-controller",
      actorTag: "FUKU",
      mode: 1,
      intervalNativeTicks: 2,
      parameter: 0,
    }] }],
  }), true);
  assert.deepEqual(calls.map(([adapter, command]) => [adapter, command.name]), [
    ["hand", "detailed-hand-default"],
    ["face", "face-controller"],
  ]);
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
});

test("AUTH presentation consumes FACE/CLIP effects when no verified face surface is available", async () => {
  const { runtime } = harness();
  const owner = await runtime.beginActivity({
    activityId: "TEST/FACE-EFFECT-WITHOUT-SURFACE.AUTH",
    actors: ["SINF"],
    initialFrames: [],
  });
  assert.equal(runtime.advanceActivity({
    owner,
    previousFrame: 0,
    currentFrame: 1,
    frames: [{ frame: 1, commands: [{
      name: "effect",
      actorTag: "SINF",
      effectType: 6,
      pattern: 0,
      speed: 1,
    }] }],
  }), true);
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
});

test("AUTH presentation still fails closed for an unknown command", async () => {
  const { runtime } = harness();
  const owner = await runtime.beginActivity({
    activityId: "TEST/UNSUPPORTED.AUTH",
    actors: ["AKIR"],
    initialFrames: [],
  });
  assert.throws(() => runtime.advanceActivity({
    owner,
    previousFrame: 0,
    currentFrame: 1,
    frames: [{ frame: 1, commands: [{ name: "unknown-command" }] }],
  }), /unsupported/);
  assert.equal(runtime.endActivity({ owner, reason: "presentation-failed" }), true);
});

test("AUTH presentation owns detailed faces and hands around body motion", async () => {
  const calls = [];
  const runtime = createNativeAseqPresentationRuntime({
    actors: {
      begin: () => (calls.push("actors-begin"), true),
      applyTransform: () => true,
      applyMotion: () => (calls.push("body-motion"), true),
      end: () => (calls.push("actors-end"), true),
    },
    faces: {
      prepare: ({ actors }) => (calls.push(["faces-prepare", actors]), true),
      begin: () => (calls.push("faces-begin"), true),
      play: () => (calls.push("faces-voice"), true),
      apply: () => (calls.push("faces-apply"), true),
      end: () => (calls.push("faces-end"), true),
    },
    hands: {
      prepare: ({ actors }) => (calls.push(["hands-prepare", actors]), true),
      begin: () => (calls.push("hands-begin"), true),
      play: () => (calls.push("hands-pose"), true),
      apply: () => (calls.push("hands-apply"), true),
      end: () => (calls.push("hands-end"), true),
    },
    secondaryMotion: {
      begin: () => (calls.push("secondary-begin"), true),
      apply: () => (calls.push("secondary-apply"), true),
      end: () => (calls.push("secondary-end"), true),
    },
    cloth: {
      begin: () => (calls.push("cloth-begin"), true),
      apply: () => (calls.push("cloth-apply"), true),
      end: () => (calls.push("cloth-end"), true),
    },
    camera: {
      begin: () => true,
      apply: () => true,
      end: () => true,
    },
    audio: {
      begin: () => true,
      play: () => (calls.push("audio-voice"), true),
      end: () => true,
    },
  });
  assert.equal(await runtime.prepare({ actors: ["AKIR"] }), true);
  const owner = runtime.beginActivity({
    activityId: "TEST/FACE.AUTH",
    actors: ["AKIR"],
    initialFrames: [{
      frame: 0,
      commands: [{
        name: "motion",
        actorTag: "AKIR",
        motion: { sequence: {} },
        startFrame: 1,
        endFrame: 2,
      }, {
        name: "voice",
        actorTag: "AKIR",
        durationSeconds: 1,
      }, {
        name: "hand-pose",
        actorTag: "AKIR",
        side: "left",
        durationNativeTicks: 1,
        vectors: Array.from({ length: 19 }, () => [0, 0, 0]),
      }],
    }],
  });
  assert.ok(owner);
  assert.deepEqual(calls.slice(0, 2), [
    ["faces-prepare", ["AKIR"]],
    ["hands-prepare", ["AKIR"]],
  ]);
  assert.ok(calls.indexOf("actors-begin") < calls.indexOf("hands-begin"));
  assert.ok(calls.indexOf("actors-begin") < calls.indexOf("secondary-begin"));
  assert.ok(calls.indexOf("secondary-begin") < calls.indexOf("hands-begin"));
  assert.ok(calls.indexOf("secondary-begin") < calls.indexOf("cloth-begin"));
  assert.ok(calls.indexOf("hands-begin") < calls.indexOf("faces-begin"));
  assert.ok(calls.indexOf("actors-begin") < calls.indexOf("faces-begin"));
  assert.ok(calls.indexOf("audio-voice") < calls.indexOf("faces-voice"));
  assert.ok(calls.indexOf("hands-pose") < calls.indexOf("hands-apply"));
  assert.ok(calls.indexOf("body-motion") < calls.indexOf("faces-apply"));
  assert.ok(calls.indexOf("body-motion") < calls.indexOf("hands-apply"));
  assert.ok(calls.indexOf("hands-apply") < calls.indexOf("secondary-apply"));
  assert.ok(calls.indexOf("secondary-apply") < calls.indexOf("cloth-apply"));
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
  assert.ok(calls.indexOf("faces-end") < calls.indexOf("actors-end"));
  assert.ok(calls.indexOf("hands-end") < calls.indexOf("actors-end"));
  assert.ok(calls.indexOf("hands-end") < calls.indexOf("secondary-end"));
  assert.ok(calls.indexOf("cloth-end") < calls.indexOf("secondary-end"));
  assert.ok(calls.indexOf("secondary-end") < calls.indexOf("actors-end"));
});

test("AUTH presentation suppresses transient seek audio but rebuilds face state", () => {
  const calls = [];
  const runtime = createNativeAseqPresentationRuntime({
    actors: {
      begin: () => true,
      applyTransform: () => true,
      applyMotion: () => true,
      end: () => true,
    },
    faces: {
      prepare: () => true,
      begin: () => true,
      play: (_owner, command) => (calls.push(["face", command.name]), true),
      apply: () => true,
      end: () => true,
    },
    camera: { begin: () => true, apply: () => true, end: () => true },
    audio: {
      begin: () => true,
      play: (_owner, command) => (calls.push(["audio", command.name]), true),
      end: () => true,
    },
  });
  assert.equal(runtime.setTransientAudioSuppressed(true), true);
  const owner = runtime.beginActivity({
    activityId: "TEST/SEEK.AUTH",
    actors: ["AKIR"],
    initialFrames: [{
      frame: 0,
      commands: [{ name: "voice", actorTag: "AKIR" }],
    }],
  });
  assert.deepEqual(calls, [["face", "voice"]]);
  assert.equal(runtime.setTransientAudioSuppressed(false), true);
  assert.equal(runtime.endActivity({ owner, reason: "complete" }), true);
});
