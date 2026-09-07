import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAseqAudioPresentation,
} from "../play/events/NativeAseqAudioPresentation.js";

function fakeAudio(source) {
  return {
    source,
    muted: false,
    volume: 1,
    paused: false,
    listeners: new Map(),
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    play() { return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}

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
