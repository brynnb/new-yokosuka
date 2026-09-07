import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueVoiceManifest,
} from "../play/dialogue/NativeDialogueVoiceManifest.js";

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("native voice manifest resolves exact content-addressed lines", async () => {
  let fetchCount = 0;
  const manifest = createNativeDialogueVoiceManifest({
    baseUrl: "",
    fetchJson: async (url) => {
      fetchCount += 1;
      assert.equal(url, "/audio/dialogue/manifest.json");
      return {
        schema: "new-yokosuka-dialogue-voice-pack-v1",
        lines: [{
          voiceId: "F1030B001",
          url: "/audio/dialogue/native-hash.m4a",
        }],
      };
    },
  });

  assert.equal(
    await manifest.urlFor("f1030b001"),
    "/audio/dialogue/native-hash.m4a",
  );
  assert.equal(await manifest.urlFor("MISSING"), null);
  assert.equal(fetchCount, 1);
});

test("native voice manifest rejects conflicting voice routes", async () => {
  const manifest = createNativeDialogueVoiceManifest({
    baseUrl: "",
    fetchJson: async () => ({
      schema: "new-yokosuka-dialogue-voice-pack-v1",
      lines: [
        { voiceId: "F1030B001", url: "/one.m4a" },
        { voiceId: "F1030B001", url: "/two.m4a" },
      ],
    }),
  });

  await assert.rejects(
    manifest.urlFor("F1030B001"),
    /conflicting URLs/,
  );
});

test("native voice URLs can be derived without downloading a manifest", async () => {
  const manifest = createNativeDialogueVoiceManifest({
    baseUrl: "https://voices.example.test/dialogue/voices/v1/",
    preferLocal: false,
    fetchJson: async () => {
      throw new Error("manifest should not load");
    },
  });

  assert.equal(
    await manifest.urlFor("f1030b001"),
    "https://voices.example.test/dialogue/voices/v1/F1030B001.m4a",
  );
});

test("native voices prefetch sequentially in authored order", async () => {
  const requested = [];
  const releases = [];
  const manifest = createNativeDialogueVoiceManifest({
    baseUrl: "https://voices.example.test/dialogue/voices/v1",
    fetchAudio: (url) => new Promise((resolve) => {
      requested.push(url);
      releases.push(resolve);
    }),
  });

  const pending = manifest.prefetch([
    "F0001A001",
    "F0001B001",
    "F0001A001",
    "F0001A002",
  ]);
  await nextTurn();
  assert.deepEqual(requested, [
    "https://voices.example.test/dialogue/voices/v1/F0001A001.m4a",
  ]);

  releases.shift()();
  await nextTurn();
  assert.equal(requested.at(-1).endsWith("/F0001B001.m4a"), true);

  releases.shift()();
  await nextTurn();
  assert.equal(requested.at(-1).endsWith("/F0001A002.m4a"), true);

  releases.shift()();
  assert.deepEqual(await pending, [true, true, true]);
});
