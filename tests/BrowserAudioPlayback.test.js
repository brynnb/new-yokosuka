import assert from "node:assert/strict";
import test from "node:test";
import { BrowserAudioPlayback } from "../play/audio/BrowserAudioPlayback.js";
import { isAudioActivationGesture } from "../play/audio/UserActivation.js";

class Media extends EventTarget {
  constructor() {
    super();
    this.src = "";
    this.currentTime = 0;
    this.duration = 10;
    this.readyState = 1;
    this.paused = true;
    this.calls = [];
    this.playResult = () => Promise.resolve();
  }
  play() { this.calls.push(this.src); this.paused = false; return this.playResult(); }
  pause() { this.paused = true; }
  load() {
    this.currentTime = 0;
    if (this.src) this.dispatchEvent(new Event("loadedmetadata"));
  }
  removeAttribute(name) { if (name === "src") this.src = ""; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(capacity = 2) {
  const media = [], document = new EventTarget(), window = new EventTarget();
  let gesture;
  const backend = new BrowserAudioPlayback({capacity, document, window,
    subscribeGesture: callback => { gesture = callback; return () => {}; },
    audioFactory: () => { const result = new Media(); media.push(result); return result; },
  });
  return {backend, media, document, window, gesture: () => gesture()};
}

test("touch down and synthetic events do not consume audio activation; touch release does", () => {
  const event = (type, extra = {}) => ({type, isTrusted: true, ...extra});
  assert.equal(isAudioActivationGesture(event("pointerdown", {pointerType: "touch"})), false);
  assert.equal(isAudioActivationGesture(event("pointerup", {pointerType: "touch"})), true);
  assert.equal(isAudioActivationGesture(event("touchend")), true);
  assert.equal(isAudioActivationGesture(event("pointerdown", {pointerType: "mouse"})), true);
  assert.equal(isAudioActivationGesture(event("keydown", {key: "Enter"})), true);
  assert.equal(isAudioActivationGesture(event("keydown", {key: "Escape"})), false);
  assert.equal(isAudioActivationGesture(event("keydown", {repeat: true})), false);
  assert.equal(isAudioActivationGesture(event("click", {isTrusted: false})), false);
});

test("gesture primes real unmuted players synchronously; async clips reuse them", async () => {
  const h = harness();
  h.gesture();
  assert.equal(h.media.length, 2);
  assert.equal(h.media.every(media => media.calls.length === 1 && !media.muted), true);
  await flush();
  for (let i = 0; i < 12; i++) {
    const clip = h.backend.create(`/voice-${i}.wav`);
    let ended = 0;
    clip.addEventListener("ended", () => ended++);
    await clip.play();
    h.media[0].dispatchEvent(new Event("ended"));
    assert.equal(ended, 1);
  }
  assert.equal(h.media.length, 2);
  h.backend.dispose();
});

test("blocked dialogue recovers, while expired effects and cancelled dialogue never replay", async () => {
  const h = harness();
  const dialogue = h.backend.create("/dialogue.wav", {recovery: "resume"});
  const cancelled = h.backend.create("/old.wav", {recovery: "resume"});
  const effect = h.backend.create("/old-effect.wav");
  await assert.rejects(dialogue.play(), {name: "NotAllowedError"});
  await assert.rejects(cancelled.play(), {name: "NotAllowedError"});
  await assert.rejects(effect.play(), {name: "NotAllowedError"});
  assert.equal(h.backend.needsGesture(), true);
  cancelled.pause();
  h.gesture();
  await flush();
  assert.equal(dialogue.paused, false);
  assert.equal(h.backend.needsGesture(), false);
  assert.equal(h.media.flatMap(media => media.calls).some(src => src === "/old.wav" || src === "/old-effect.wav"), false);
  h.backend.dispose();
});

test("failed priming remains recoverable on the next gesture", async () => {
  const h = harness(1);
  h.backend.audioFactory = () => {
    const media = new Media(); h.media.push(media);
    media.playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    return media;
  };
  h.gesture();
  await flush();
  const clip = h.backend.create("/music.ogg", {recovery: "resume"});
  await assert.rejects(clip.play(), {name: "NotAllowedError"});
  h.media[0].playResult = () => Promise.resolve();
  h.gesture();
  await flush();
  assert.equal(clip.paused, false);
  assert.equal(h.backend.needsGesture(), false);
  h.backend.dispose();
});

test("background return resumes music from its saved position without replaying effects", async () => {
  const h = harness();
  h.gesture(); await flush();
  const music = h.backend.create("/music.ogg", {recovery: "resume"});
  const effect = h.backend.create("/footstep.wav");
  await music.play(); await effect.play();
  h.media[0].currentTime = 4;
  h.document.hidden = true;
  h.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(music.paused, true);
  h.document.hidden = false;
  h.document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(music.paused, false);
  assert.equal(music.currentTime, 4);
  assert.equal(h.media.flatMap(media => media.calls).filter(src => src === "/footstep.wav").length, 1);
  h.backend.dispose();
});

test("delayed play settlement cannot touch a reused channel or resurrect cancellation", async () => {
  const h = harness(1);
  h.gesture(); await flush();
  const deferred = Promise.withResolvers();
  h.media[0].playResult = () => deferred.promise;
  const old = h.backend.create("/old.wav", {recovery: "resume"});
  const pending = old.play();
  await flush(); old.pause();
  h.media[0].playResult = () => Promise.resolve();
  const current = h.backend.create("/new.wav");
  await current.play();
  deferred.resolve(); await pending;
  assert.equal(current.paused, false);
  assert.equal(h.media[0].src, "/new.wav");
  const beforeAcquire = h.backend.create("/cancelled-before-acquire.wav");
  current.pause();
  const acquiring = beforeAcquire.play(); beforeAcquire.pause();
  await assert.rejects(acquiring, {name: "AbortError"});
  assert.equal(h.media[0].calls.includes("/cancelled-before-acquire.wav"), false);
  h.backend.dispose();
});

test("network failures and pool exhaustion stay errors, not permission recovery", async () => {
  const h = harness(1);
  h.gesture(); await flush();
  const live = h.backend.create("/live.wav");
  await live.play();
  await assert.rejects(h.backend.create("/overflow.wav", {recovery: "resume"}).play(), {name: "QuotaExceededError"});
  live.pause();
  h.media[0].playResult = () => Promise.reject(new DOMException("bad media", "NotSupportedError"));
  await assert.rejects(h.backend.create("/bad.wav", {recovery: "resume"}).play(), {name: "NotSupportedError"});
  assert.equal(h.backend.needsGesture(), false);
  assert.equal(h.backend.slots[0].owner, null);
  h.backend.dispose();
});

test("existing spatial audio context recovers from interruption and unregister ignores late resume", async () => {
  const h = harness();
  const context = new EventTarget();
  context.state = "suspended";
  context.resume = () => Promise.reject(new DOMException("gesture required", "NotAllowedError"));
  const release = h.backend.registerContext(context);
  await flush();
  assert.equal(h.backend.needsGesture(), true);
  context.resume = () => { context.state = "running"; return Promise.resolve(); };
  h.gesture(); await flush();
  assert.equal(h.backend.needsGesture(), false);
  const pending = Promise.withResolvers();
  context.state = "interrupted";
  context.resume = () => pending.promise;
  context.dispatchEvent(new Event("statechange"));
  h.gesture(); release();
  pending.reject(new Error("late denial")); await flush();
  assert.equal(h.backend.needsGesture(), false);
  h.backend.dispose();
});

test("priming timeout is bounded, remains a resource error, and can retry", async () => {
  const h = harness(1);
  h.backend.primeTimeoutMs = 10;
  const pending = Promise.withResolvers();
  h.backend.audioFactory = () => {
    const media = new Media(); h.media.push(media);
    media.playResult = () => pending.promise;
    return media;
  };
  h.gesture();
  await assert.rejects(h.backend.create("/waiting.wav", {recovery: "resume"}).play(), {name: "TimeoutError"});
  assert.equal(h.backend.needsGesture(), false);
  h.media[0].playResult = () => Promise.resolve();
  h.gesture(); await flush();
  const current = h.backend.create("/current.wav");
  await current.play();
  pending.resolve(); await flush();
  assert.equal(current.paused, false);
  assert.equal(h.media[0].src, "/current.wav");
  h.backend.dispose();
});

test("immediate cancel then replay cannot lose the new acquisition or release its lease", async () => {
  const h = harness(1);
  h.gesture(); await flush();
  const clip = h.backend.create("/resumed.wav", {recovery: "resume"});
  const old = clip.play();
  clip.pause();
  const current = clip.play();
  await assert.rejects(old, {name: "AbortError"});
  await current;
  assert.equal(clip.paused, false);
  assert.equal(h.backend.slots[0].owner, clip);
  h.backend.dispose();
});

test("one hung primer cannot delay a ready audio channel", async () => {
  const h = harness();
  const pending = Promise.withResolvers();
  h.backend.audioFactory = () => {
    const media = new Media();
    if (h.media.length === 0) media.playResult = () => pending.promise;
    h.media.push(media); return media;
  };
  h.gesture();
  const clip = h.backend.create("/ready.wav");
  await clip.play();
  assert.equal(clip.paused, false);
  assert.equal(h.media[1].src, "/ready.wav");
  pending.resolve(); await flush();
  h.backend.dispose();
});
