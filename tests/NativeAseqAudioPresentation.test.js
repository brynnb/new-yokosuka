import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAseqAudioPresentation,
} from "../play/events/NativeAseqAudioPresentation.js";
import { createNativeAseqPresentationRuntime } from "../play/events/NativeAseqPresentationRuntime.js";

function fakeAudio(source) {
  return {
    source,
    muted: false,
    volume: 1,
    paused: false,
    currentTime: 0,
    duration: 10,
    playCalls: 0,
    listeners: new Map(),
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    removeEventListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name); },
    play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}

function sessionHarness() {
  const media = [], captions = [], attached = new Set();
  const audio = createNativeAseqAudioPresentation({
    audioFactory: source => { const element = fakeAudio(source); media.push(element); return element; },
    preferences: { getState: () => ({ overallVolume: 1, effectsVolume: 1 }) },
    dialogueAudio: { attach: element => attached.add(element), detach: element => attached.delete(element) },
    voicePresentation: {
      begin: () => true, play: (_owner, cue) => (captions.push(["play", cue.command]), true),
      endVoice: (_owner, cue) => (captions.push(["end", cue.command]), true), end: () => true,
    },
  });
  const session = {};
  audio.begin(session);
  const voice = id => ({ name: "voice", actorTag: "SINF",
    audio: { kind: "voice", speakerId: "SINF", assetUrl: `/${id}.wav` } });
  return { audio, session, media, captions, attached, voice };
}

test("program audio and caption ownership survive normal shot changes, then end once", () => {
  const { audio, session, media, voice, captions, attached } = sessionHarness();
  audio.end(session);
  const yes = () => true;
  const presentation = createNativeAseqPresentationRuntime({ audio,
    actors: { begin: yes, end: yes, applyTransform: yes, applyMotion: yes },
    camera: { begin: yes, end: yes, apply: yes } });
  presentation.beginProgram(session);
  const command = voice("narration");
  const a = presentation.beginActivity({ activityId: "A", actors: [],
    initialFrames: [{ frame: 0, commands: [command] }] });
  media[0].currentTime = 2;
  const identity = audio.voiceCues().get("SINF");
  presentation.endActivity({ owner: a, reason: "complete" });
  const b = presentation.beginActivity({ activityId: "B", actors: [], initialFrames: [] });
  assert.equal(media[0].paused, false);
  assert.equal(media[0].playCalls, 1);
  assert.equal(audio.voiceCues().get("SINF"), identity);
  assert.equal(identity.positionSeconds, 2);
  assert.deepEqual(captions, [["play", command]]);
  presentation.endActivity({ owner: b, reason: "complete" });
  presentation.endProgram(session);
  assert.equal(media[0].paused, true);
  assert.equal(attached.size, 0);
  assert.deepEqual(captions, [["play", command], ["end", command]]);
});

test("seeking advances ongoing voices and starts only surviving new clips at their offset", () => {
  const { audio, session, media, voice } = sessionHarness();
  audio.play(session, voice("ongoing"));
  media[0].currentTime = 2;
  audio.setSeeking(session, true);
  audio.play(session, voice("short"));
  media[1].duration = 1;
  for (let frame = 0; frame < 90; frame++) audio.advanceFrame(session);
  audio.play(session, voice("late"));
  for (let frame = 0; frame < 60; frame++) audio.advanceFrame(session);
  assert.deepEqual(media.map(value => value.playCalls), [1, 0, 0]);
  audio.setSeeking(session, false);
  assert.deepEqual(media.map(value => value.playCalls), [2, 0, 1]);
  assert.equal(media[0].currentTime, 7);
  assert.equal(media[2].currentTime, 2);
  assert.equal(audio.voiceCues().get("SINF").positionSeconds, 2);
  audio.end(session);
});

test("late play completion and metadata cannot affect a replay", async () => {
  const { audio, session, media, voice, attached } = sessionHarness();
  audio.play(session, voice("old"));
  const pending = Promise.withResolvers();
  media[0].play = () => pending.promise;
  audio.setPaused(session, true);
  audio.setPaused(session, false);
  media[0].duration = NaN;
  audio.setSeeking(session, true);
  audio.advanceFrame(session);
  audio.setSeeking(session, false);
  const lateMetadata = media[0].listeners.get("loadedmetadata");
  audio.end(session);
  const replay = {};
  audio.begin(replay);
  audio.play(replay, voice("new"));
  pending.resolve();
  media[0].duration = 10;
  lateMetadata();
  await Promise.resolve();
  assert.equal(media[0].paused, true);
  assert.equal(media[1].paused, false);
  assert.equal(attached.size, 1);
  audio.end(replay);
});

test("an aborted old play promise cannot release a successfully resumed voice", async () => {
  const { audio, session, media, voice, attached } = sessionHarness();
  audio.play(session, voice("resumed"));
  const pending = Promise.withResolvers();
  audio.setPaused(session, true);
  media[0].play = () => pending.promise;
  audio.setPaused(session, false);
  audio.setPaused(session, true);
  media[0].play = () => { media[0].paused = false; return Promise.resolve(); };
  audio.setPaused(session, false);
  pending.reject(new Error("old play aborted by pause"));
  await Promise.resolve();
  assert.equal(media[0].paused, false);
  assert.equal(attached.size, 1);
  assert.equal(audio.voiceCues().size, 1);
  audio.end(session);
});

test("seek waits for metadata, resumes at the offset, and reports timed-out or failed resources", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const { audio, session, media, voice, attached } = sessionHarness();
  audio.setSeeking(session, true);
  for (const id of ["loaded", "timeout", "failed"]) audio.play(session, voice(id));
  for (const element of media) element.duration = NaN;
  for (let frame = 0; frame < 60; frame++) audio.advanceFrame(session);
  audio.setSeeking(session, false);
  assert.deepEqual(media.map(element => element.playCalls), [0, 0, 0]);
  media[0].duration = 10;
  media[0].listeners.get("loadedmetadata")();
  assert.equal(media[0].currentTime, 2);
  assert.equal(media[0].playCalls, 1);
  media[2].error = { code: 4 };
  media[2].listeners.get("error")();
  t.mock.timers.tick(10_000);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0][0], "[Cutscene audio] resource failed");
  assert.equal(warnings[1][0], "[Cutscene audio] seek metadata timed out");
  assert.equal(attached.size, 1);
  assert.deepEqual(media.map(element => element.playCalls), [1, 0, 0]);
  audio.end(session);
});

test("an explicit audio stop releases matching cues without ending the session", () => {
  const { audio, session, media, voice } = sessionHarness();
  audio.play(session, voice("one"));
  audio.play(session, { name: "voice", audio: { kind: "voice", stop: true } });
  assert.equal(media[0].paused, true);
  assert.equal(audio.voiceCues().size, 0);
  audio.play(session, voice("two"));
  assert.equal(media[1].paused, false);
  audio.end(session);
});

test("AUTH audio owns voice and sound elements independently", () => {
  const created = [];
  const attached = new Set();
  let preferenceState = {
    overallVolume: 0.8,
    effectsVolume: 0.5,
    effectsMuted: false,
    masterMuted: false,
  };
  let preferenceListener = null;
  const runtime = createNativeAseqAudioPresentation({
    audioFactory: source => {
      const audio = fakeAudio(source);
      created.push(audio);
      return audio;
    },
    preferences: {
      getState: () => preferenceState,
      subscribe: listener => {
        preferenceListener = listener;
        return () => { preferenceListener = null; };
      },
    },
    dialogueAudio: {
      attach: audio => attached.add(audio),
      detach: audio => attached.delete(audio),
    },
  });
  const owner = {};
  assert.equal(runtime.begin(owner), true);
  assert.equal(runtime.play(owner, {
    name: "sound",
    audio: { kind: "sound", assetUrl: "/sfx.wav" },
  }), true);
  assert.equal(runtime.play(owner, {
    name: "voice",
    audio: { kind: "voice", assetUrl: "/voice.wav" },
  }), true);
  assert.equal(created.length, 2);
  assert.equal(created[0].volume, 0.5 * 0.35 * 0.8);
  assert.equal(created[0].muted, false);
  assert.equal(attached.has(created[1]), true);

  preferenceState = { ...preferenceState, masterMuted: true };
  preferenceListener();
  assert.equal(created[0].volume, 0);
  assert.equal(created[0].muted, true);
  assert.equal(runtime.end(owner), true);
  assert.ok(created.every(audio => audio.paused));
  assert.equal(attached.size, 0);
  runtime.dispose();
});

test("muted AUTH sound cues are accepted without allocating playback", () => {
  let created = 0;
  const runtime = createNativeAseqAudioPresentation({
    audioFactory: () => (created += 1),
    preferences: {
      getState: () => ({
        overallVolume: 1,
        effectsVolume: 1,
        effectsMuted: true,
        masterMuted: false,
      }),
    },
    dialogueAudio: { attach() {}, detach() {} },
  });
  const owner = {};
  runtime.begin(owner);
  assert.equal(runtime.play(owner, {
    name: "sound",
    audio: { kind: "sound", assetUrl: "/muted.wav" },
  }), true);
  assert.equal(created, 0);
  runtime.end(owner);
});

test("layered AUTH sounds play every native sample and missing voices stay silent", () => {
  const created = [];
  const runtime = createNativeAseqAudioPresentation({
    audioFactory: source => (created.push(source), fakeAudio(source)),
    preferences: {
      getState: () => ({
        overallVolume: 1,
        effectsVolume: 1,
        effectsMuted: false,
        masterMuted: false,
      }),
    },
    dialogueAudio: { attach() {}, detach() {} },
  });
  const owner = {};
  runtime.begin(owner);
  assert.equal(runtime.play(owner, {
    name: "sound",
    audio: { kind: "sound", assetUrls: ["/layer-a.wav", "/layer-b.wav"] },
  }), true);
  assert.deepEqual(created, ["/layer-a.wav", "/layer-b.wav"]);
  assert.equal(runtime.play(owner, {
    name: "voice",
    audio: { kind: "voice", silent: true, assetUrls: [] },
  }), true);
  assert.equal(created.length, 2);
  runtime.end(owner);
});

test("AUTH sound stop commands release every active transient sound", () => {
  const created = [];
  const runtime = createNativeAseqAudioPresentation({
    audioFactory: source => {
      const audio = fakeAudio(source);
      created.push(audio);
      return audio;
    },
    preferences: {
      getState: () => ({
        overallVolume: 1,
        effectsVolume: 1,
        effectsMuted: false,
        masterMuted: false,
      }),
    },
    dialogueAudio: { attach() {}, detach() {} },
  });
  const owner = {};
  runtime.begin(owner);
  runtime.play(owner, {
    name: "sound",
    audio: { kind: "sound", assetUrl: "/first.wav" },
  });
  runtime.play(owner, {
    name: "sound",
    audio: { kind: "sound", assetUrl: "/second.wav" },
  });

  assert.equal(runtime.play(owner, {
    name: "sound",
    audio: { kind: "sound", silent: true, stop: true },
  }), true);
  assert.ok(created.every(audio => audio.paused));
  assert.equal(runtime.active.elements.size, 0);
  runtime.end(owner);
});

test("AUTH voice captions follow the actual audio lifecycle", async () => {
  const calls = [];
  const audio = fakeAudio("/voice.wav");
  const runtime = createNativeAseqAudioPresentation({
    audioFactory: () => audio,
    preferences: {
      getState: () => ({
        overallVolume: 1,
        effectsVolume: 1,
        effectsMuted: false,
        masterMuted: false,
      }),
    },
    dialogueAudio: { attach() {}, detach() {} },
    voicePresentation: {
      begin: owner => (calls.push(["begin", owner]), true),
      play: (owner, command) => (calls.push(["play", owner, command]), true),
      endVoice: (owner, command) => (
        calls.push(["end-voice", owner, command]), true
      ),
      end: owner => (calls.push(["end", owner]), true),
    },
  });
  const owner = {};
  const command = {
    name: "voice",
    audio: { kind: "voice", assetUrl: "/voice.wav" },
  };
  runtime.begin(owner);
  runtime.play(owner, command);
  assert.deepEqual(calls.map(value => value[0]), ["begin", "play"]);
  audio.listeners.get("ended")();
  assert.deepEqual(calls.map(value => value[0]), [
    "begin", "play", "end-voice",
  ]);
  runtime.end(owner);
  assert.deepEqual(calls.map(value => value[0]), [
    "begin", "play", "end-voice", "end",
  ]);
});

test("AUTH audio pauses and resumes owned cutscene elements", () => {
  const audio = fakeAudio("/voice.wav");
  let playCalls = 0;
  audio.play = () => {
    playCalls += 1;
    audio.paused = false;
    return Promise.resolve();
  };
  const runtime = createNativeAseqAudioPresentation({
    audioFactory: () => audio,
    preferences: {
      getState: () => ({
        overallVolume: 1,
        effectsVolume: 1,
        effectsMuted: false,
        masterMuted: false,
      }),
    },
    dialogueAudio: { attach() {}, detach() {} },
  });
  const owner = {};
  runtime.begin(owner);
  runtime.play(owner, {
    name: "voice",
    audio: { kind: "voice", assetUrl: "/voice.wav" },
  });
  assert.equal(playCalls, 1);
  assert.equal(runtime.setPaused(owner, true), true);
  assert.equal(audio.paused, true);
  assert.equal(runtime.setPaused(owner, false), true);
  assert.equal(playCalls, 2);
  runtime.end(owner);
});
