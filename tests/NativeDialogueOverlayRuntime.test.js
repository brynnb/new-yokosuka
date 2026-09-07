import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueOverlayRuntime,
} from "../play/dialogue/NativeDialogueOverlayRuntime.js";

function element() {
  return {
    hidden: true,
    textContent: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

test("native overlay advances when the active voice audio finishes", async () => {
  const root = element();
  const speaker = element();
  const sourceText = element();
  const japaneseText = element();
  const locks = [];
  let callbacks;
  let updateValue = null;
  let advanceCount = 0;
  let audioPlayed = 0;
  let audioPaused = 0;
  let audioEnded;
  const prefetched = [];
  const runtime = createNativeDialogueOverlayRuntime({
    root,
    speaker,
    sourceText,
    japaneseText,
    voiceManifest: {
      async urlFor(voiceId) {
        assert.equal(voiceId, "F1030B001");
        return "/native-hash.m4a";
      },
      async prefetch(voiceIds) {
        prefetched.push([...voiceIds]);
      },
    },
    audioFactory(url) {
      assert.equal(url, "/native-hash.m4a");
      return {
        addEventListener(type, listener) {
          if (type === "ended") audioEnded = listener;
        },
        async play() {
          audioPlayed += 1;
        },
        pause() {
          audioPaused += 1;
        },
        removeAttribute() {},
        load() {},
      };
    },
    interactionFactory(options) {
      callbacks = options;
      return {
        async start() {
          options.onStarted();
          return { status: "messageGroup" };
        },
        update(value) {
          updateValue = value;
          return true;
        },
        advance() {
          advanceCount += 1;
          return true;
        },
        stop() {
          options.onStopped();
          return true;
        },
        resumeEvent() {
          return Promise.resolve(null);
        },
      };
    },
    onMovementLockChanged(locked) {
      locks.push(locked);
    },
  });

  await runtime.start({ actorCode: "HATO" });
  const message = {
    nativeParticipantCode: "HATO",
    speakerId: "HATO",
    voiceId: "F1030B001",
    displayText: "Get out of here.",
  };
  const nextMessage = {
    voiceId: "F1030B002",
    displayText: "Next.",
  };
  callbacks.onMessageStart(message, {
    group: {
      presentation: {
        commands: [
          { kind: "message", message },
          { kind: "nativeCommand" },
          { kind: "message", message: nextMessage },
        ],
      },
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(root.hidden, false);
  assert.equal(speaker.textContent, "Yoshifumi Hato");
  assert.equal(sourceText.textContent, "Get out of here.");
  assert.equal(japaneseText.hidden, true);
  assert.equal(audioPlayed, 1);
  assert.deepEqual(prefetched, [["F1030B002"]]);
  assert.deepEqual(locks, [true]);

  audioEnded();
  assert.equal(advanceCount, 1);

  assert.equal(runtime.update(1234), true);
  assert.equal(updateValue, 1234);
  assert.equal(runtime.advance(), true);
  assert.equal(advanceCount, 2);
  callbacks.onMessageEnd(message);
  assert.equal(root.hidden, true);
  assert.equal(audioPaused, 1);
  assert.deepEqual(locks, [true]);

  callbacks.onComplete({ kind: "session" });
  assert.deepEqual(locks, [true, false]);
  runtime.dispose();
});

test("native overlay names and marks Ryo's authored participant code", () => {
  const root = element();
  const speaker = element();
  let callbacks;
  const runtime = createNativeDialogueOverlayRuntime({
    root,
    speaker,
    sourceText: element(),
    japaneseText: element(),
    voiceManifest: { async urlFor() { return null; } },
    interactionFactory(options) {
      callbacks = options;
      return {
        start() {
          options.onStarted();
          return Promise.resolve({ status: "messageGroup" });
        },
        update() { return false; },
        advance() { return false; },
        stop() { return false; },
        resumeEvent() { return Promise.resolve(null); },
      };
    },
  });

  runtime.start({ actorCode: "TEST" });
  callbacks.onMessageStart({
    nativeParticipantCode: "AKIR",
    speakerId: "AKIR",
    voiceId: "F0000A001",
    displayText: "I see.",
  });
  assert.equal(speaker.textContent, "Ryo Hazuki");
  assert.equal(speaker.attributes["data-dialogue-speaker"], "ryo");
  runtime.dispose();
});

test("native overlay keeps authored subtitles when voice audio is absent", async () => {
  const root = element();
  const sourceText = element();
  let callbacks;
  let audioCreated = false;
  const runtime = createNativeDialogueOverlayRuntime({
    root,
    speaker: element(),
    sourceText,
    japaneseText: element(),
    voiceManifest: { async urlFor() { return null; } },
    audioFactory() {
      audioCreated = true;
      return {};
    },
    interactionFactory(options) {
      callbacks = options;
      return {
        start() {
          options.onStarted();
          return Promise.resolve({ status: "messageGroup" });
        },
        update() { return false; },
        advance() { return false; },
        stop() { return false; },
        resumeEvent() { return Promise.resolve(null); },
      };
    },
  });

  await runtime.start({ actorCode: "KEBB" });
  callbacks.onMessageStart({
    nativeParticipantCode: "KEBB",
    voiceId: "F1070B004",
    displayText: null,
    sourceText: "宮城「The general public isn't＆allowed in here!」",
  });
  await Promise.resolve();

  assert.equal(sourceText.textContent, "The general public isn't\nallowed in here!");
  assert.equal(root.hidden, false);
  assert.equal(audioCreated, false);
  runtime.dispose();
});
