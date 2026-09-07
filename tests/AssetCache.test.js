import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import {AssetDataCache, AssetRequestCache, decodedAssetData} from "../src/AssetCache.js";
import {PvrDecoder} from "../src/PvrDecoder.js";

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

test("asset LRU accounts bytes, refreshes recent entries and refuses oversized retention", () => {
  const cache = new AssetDataCache(5);
  cache.set("a", "A", 2); cache.set("b", "B", 3);
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C", 2);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.bytes, 4);
  cache.set("huge", "H", 6);
  assert.equal(cache.get("huge"), undefined);
  assert.equal(cache.get("a"), "A");
  cache.clear(); assert.equal(cache.bytes, 0);
});

test("shared requests survive one consumer leaving and reuse the same completed bytes", async () => {
  const response = deferred();
  let calls = 0;
  let fetchSignal;
  const cache = new AssetRequestCache({fetch: (_url, {signal}) => {
    calls++; fetchSignal = signal; return response.promise;
  }});
  const leaving = new AbortController();
  const one = cache.read("actor", {signal: leaving.signal});
  const two = cache.read("actor");
  leaving.abort();
  await assert.rejects(one, {name: "AbortError"});
  assert.equal(fetchSignal.aborted, false);
  response.resolve(new Response("model"));
  const value = await two;
  assert.equal(await cache.read("actor"), value);
  assert.equal(calls, 1);
});

test("aborted requests cannot poison a replacement request or cache late data", async () => {
  const old = deferred();
  let calls = 0;
  const cache = new AssetRequestCache({fetch: () => ++calls === 1 ? old.promise : new Response("new")});
  const controller = new AbortController();
  const pending = cache.read("actor", {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, {name: "AbortError"});
  const fresh = await cache.read("actor");
  old.resolve(new Response("stale"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await cache.read("actor"), fresh);
  assert.equal(new TextDecoder().decode(fresh.buffer), "new");
  assert.equal(cache.active, 0);
});

test("asset queue limits concurrency, skips cancelled work, and prioritizes visible models", async () => {
  const first = deferred(); const calls = [];
  const cache = new AssetRequestCache({concurrency: 1, fetch: url => {
    calls.push(url); return url === "first" ? first.promise : new Response(url);
  }});
  const running = cache.read("first");
  const background = cache.read("background", {priority: -1});
  const cancelled = new AbortController();
  const unused = cache.read("unused", {signal: cancelled.signal});
  const visible = cache.read("visible", {priority: 1});
  cancelled.abort(); await assert.rejects(unused, {name: "AbortError"});
  assert.deepEqual(calls, ["first"]);
  first.resolve(new Response("one"));
  await Promise.all([running, background, visible]);
  assert.deepEqual(calls, ["first", "visible", "background"]);
});

test("asset reads retry bounded stalls/transient errors, but do not cache missing assets or HTML", async () => {
  let attempts = 0;
  const cache = new AssetRequestCache({timeoutMs: 5, fetch: (_url, {signal}) => {
    if (++attempts === 1) return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {once: true});
    });
    return new Response("ok");
  }});
  await cache.read("timeout"); assert.equal(attempts, 2);
  let reads = 0;
  const missing = new AssetRequestCache({fetch: () => {
    reads++; return new Response("missing", {status: 404});
  }});
  await assert.rejects(missing.read("gone"), /404/);
  await assert.rejects(missing.read("gone"), /404/);
  assert.equal(reads, 2);
  const html = new AssetRequestCache({fetch: () => new Response("<!doctype html>", {
    headers: {"content-type": "text/html"},
  })});
  await assert.rejects(html.read("not-a-model"), /HTML/);
  const transient = new AssetRequestCache({fetch: () => new Response("unavailable", {status: 503})});
  await assert.rejects(transient.read("offline"), /503/);
  assert.equal(transient.pending.size, 0);
});

test("decoded texture pixels survive scene disposal without sharing mutable GPU buffers", t => {
  decodedAssetData.clear();
  const engine = new B.NullEngine();
  const bytes = new ArrayBuffer(4);
  let decodes = 0;
  t.mock.method(PvrDecoder.prototype, "decodePixels", () => {
    decodes++;
    return {pixelData: new Uint8Array([100, 120, 140, 255]), width: 1, height: 1,
      dataFormat: 0, hasAlpha: false, hasGradientAlpha: false};
  });
  try {
    const firstScene = new B.Scene(engine);
    const first = new PvrDecoder(bytes).decode(firstScene, {generateMipMaps: false});
    first.getInternalTexture()._bufferView[0] = 0;
    firstScene.dispose();
    const nextScene = new B.Scene(engine);
    const next = new PvrDecoder(bytes).decode(nextScene, {generateMipMaps: false});
    assert.equal(next.getInternalTexture()._bufferView[0], 100);
    assert.equal(decodes, 1);
    nextScene.dispose();
  } finally { engine.dispose(); decodedAssetData.clear(); }
});
