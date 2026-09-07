import test from "node:test";
import assert from "node:assert/strict";
import { runtimeAssets, runtimeAssetUrl, runtimeAssetGroup, runtimeAssetKey,
  resolveRuntimeAssetUrl } from "../src/RuntimeAssets.js";
import { createGameAudio } from "../play/audio/MediaElementAudio.js";
import music from "../public/music/manifest.json" with { type: "json" };

const source = "play/assets/characters/FUK_M.CHRM";

test("runtime URLs pin content and preserve offline source paths", () => {
  assert.equal(runtimeAssetUrl(source, { baseUrl: "https://assets.example/", offline: false }),
    `https://assets.example/shenmue/runtime/${runtimeAssets[source].sha256}/${source}`);
  assert.equal(runtimeAssetUrl(source, { offline: true }), `/${source}`);
  assert.equal(runtimeAssetUrl("public/music/op00-open1.ogg", { offline: true }), "/music/op00-open1.ogg");
  assert.throws(() => runtimeAssetUrl("play/assets/missing.CHRM"), /Unregistered/);
  assert.throws(() => runtimeAssetUrl("play/assets/../../.env"), /Unregistered/);
});

test("asset groups are source-independent and support exact existing selectors", () => {
  const chars = runtimeAssetGroup("play/assets/characters/*.CHRM");
  assert.ok(chars[source]);
  assert.ok(Object.keys(chars).every(k => k.startsWith("play/assets/characters/") && k.endsWith(".CHRM")));
  const group = runtimeAssetGroup(["play/assets/introduction/op02/**/*.{CHRM,MAPM}", "!**/TAK02M7G.CHRM"]);
  assert.ok(Object.keys(group).length > 0);
  assert.ok(!Object.keys(group).some(k => k.endsWith("TAK02M7G.CHRM")));
  assert.deepEqual(runtimeAssetGroup("play/assets/not-a-directory/*.CHRM"), {});
});

test("new content keys do not change an older manifest's pinned URL", () => {
  const oldKey = runtimeAssetKey(source);
  const newKey = runtimeAssetKey(source, { ...runtimeAssets[source], sha256: "a".repeat(64) });
  assert.notEqual(oldKey, newKey);
  assert.equal(runtimeAssetKey(source), oldKey);
});

test("the real audio adapter resolves native paths but preserves external URLs", () => {
  const previous = globalThis.Audio;
  globalThis.Audio = class { constructor(src) { this.src = src; } };
  try {
    const local = "/audio/forklift/a9040100.webm";
    assert.equal(createGameAudio(local).src, runtimeAssetUrl(`public${local}`));
    assert.equal(resolveRuntimeAssetUrl("https://voices.example/line.m4a"), "https://voices.example/line.m4a");
    assert.equal(resolveRuntimeAssetUrl("blob:https://example/123"), "blob:https://example/123");
  } finally { globalThis.Audio = previous; }
});

test("runtime manifest keeps original branding out of extracted assets", () => {
  for (const file of ["new-yokosuka-logo.png", "phoenix-logo.png"]) {
    assert.equal(runtimeAssets[`play/assets/account/${file}`], undefined);
  }
});

test("every local-path music track is registered for hosted clean builds", () => {
  for (const track of Object.values(music.tracks)) {
    if (track.url.startsWith("/music/")) assert.ok(runtimeAssets[`public${track.url}`], track.url);
  }
});
