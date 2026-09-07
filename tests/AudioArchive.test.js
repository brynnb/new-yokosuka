import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAudioManifest, resolveArchiveAudioUrl } from "../asset-viewer/audio/audioViewer.js";

test("audio manifests isolate games, share in-flight reads, and retry failures/timeouts", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
  try {
    const first = loadAudioManifest("shenmue");
    assert.equal(loadAudioManifest("shenmue"), first);
    const second = loadAudioManifest("shenmue2");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, "/music/shenmue2-asset-viewer-manifest.json");
    assert.ok(requests[0].options.signal instanceof AbortSignal);
    requests[1].reject(new DOMException("Timed out", "TimeoutError"));
    await assert.rejects(second, /Timed out/);
    const retry = loadAudioManifest("shenmue2");
    requests[2].resolve({ ok: true, json: async () => ({ tracks: [] }) });
    await assert.rejects(retry, /no tracks/);
    const valid = loadAudioManifest("shenmue2");
    requests[3].resolve({ ok: true, json: async () => ({ tracks: { s2: {} } }) });
    requests[0].resolve({ ok: true, json: async () => ({ tracks: { s1: {} } }) });
    assert.deepEqual(Object.keys((await valid).tracks), ["s2"]);
    assert.deepEqual(Object.keys((await first).tracks), ["s1"]);
    await assert.rejects(loadAudioManifest("missing"), /Unknown audio game/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("archive audio preserves unrelated URLs and resolves registered media", () => {
  assert.equal(resolveArchiveAudioUrl("https://example.org/audio.ogg"), "https://example.org/audio.ogg");
  assert.match(resolveArchiveAudioUrl("/music/op00-open1.ogg"), /\/shenmue\/runtime\/[a-f0-9]{64}\//);
});
