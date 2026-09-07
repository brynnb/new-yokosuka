import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { ArcadeAttractScreens } from "../play/arcade/ArcadeAttractScreens.js";

function runtimeWithWindow(fakeWindow) {
  globalThis.window = fakeWindow;
  return new ArcadeAttractScreens({
    scene: {},
    definitions: {},
    defaultWorldId: "arcade",
    syncEpochMs: 0,
    syncIntervalMs: 1000,
    maxDriftSeconds: 0.1,
    getServerWallTimeMs: () => 0,
    storage: null,
  });
}

test("attract screens retain Babylon's live video texture integration", () => {
  const originalDocument = globalThis.document;
  const originalHtmlVideoElement = globalThis.HTMLVideoElement;
  const originalWindow = globalThis.window;

  class FakeVideoElement {
    constructor() {
      this.events = new Map();
      this.paused = true;
      this.readyState = 0;
      this.HAVE_CURRENT_DATA = 2;
      this.currentSrc = "";
      this.firstChild = null;
      this.srcObject = null;
      this.loadCount = 0;
    }

    set src(value) {
      this.currentSrc = value;
    }

    get src() {
      return this.currentSrc;
    }

    addEventListener(type, listener) {
      this.events.set(type, listener);
    }

    removeEventListener(type) {
      this.events.delete(type);
    }

    setAttribute() {}

    removeAttribute() {}

    canPlayType() {
      return "";
    }

    play() {
      this.paused = false;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }

    load() {
      this.loadCount += 1;
      if (this.loadCount !== 1) return;
      assert.equal(
        this.events.has("canplay"),
        true,
        "the video texture listener must exist before loading starts",
      );
      assert.equal(
        this.events.has("loadeddata"),
        true,
        "the video texture refresh listener must exist before loading starts",
      );
    }
  }

  globalThis.HTMLVideoElement = FakeVideoElement;
  globalThis.document = {
    createElement: (tagName) => {
      assert.equal(tagName, "video");
      return new FakeVideoElement();
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };

  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const runtime = new ArcadeAttractScreens({
    scene,
    definitions: {
      hangon: {
        attractUrl: "/arcade/hangon.mp4",
        bottomLeft: [0, 0, 0],
        bottomRight: [1, 0, 0],
        topRight: [1, 1, 0],
        topLeft: [0, 1, 0],
        frontNormal: [0, 0, 1],
      },
    },
    defaultWorldId: "arcade",
    syncEpochMs: 0,
    syncIntervalMs: 1000,
    maxDriftSeconds: 0.1,
    getServerWallTimeMs: () => 0,
    storage: null,
  });

  try {
    const entry = runtime.create("hangon");
    assert.ok(entry);
    assert.equal(
      entry.texture._settings.independentVideoSource,
      undefined,
      "Babylon must install the listeners that initialize the GPU texture",
    );
    assert.equal(entry.texture._settings.autoPlay, false);
    assert.equal(entry.video.preload, "auto");
    assert.equal(entry.video.events.has("loadeddata"), true);
    assert.equal(entry.video.events.has("canplay"), true);
    assert.equal(entry.video.loadCount, 1);
  } finally {
    runtime.dispose();
    scene.dispose();
    engine.dispose();
    globalThis.document = originalDocument;
    globalThis.HTMLVideoElement = originalHtmlVideoElement;
    globalThis.window = originalWindow;
  }
});

test("TV and cinema audio share an independent persisted channel", () => {
  const originalWindow = globalThis.window;
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  const runtime = new ArcadeAttractScreens({
    scene: {},
    definitions: {
      cornerTv: { audioChannel: "tv" },
      cinemaScreen: { audioChannel: "tv" },
      hangon: {},
    },
    defaultWorldId: "arcade",
    syncEpochMs: 0,
    syncIntervalMs: 1000,
    maxDriftSeconds: 0.1,
    getServerWallTimeMs: () => 0,
    storage,
  });
  const tvVideo = { muted: false, volume: 0 };
  const cinemaVideo = { muted: false, volume: 0 };
  const arcadeVideo = { muted: false, volume: 0 };
  runtime.entries.set("cornerTv", {
    gameId: "cornerTv",
    video: tvVideo,
    distanceGain: 0.5,
  });
  runtime.entries.set("hangon", {
    gameId: "hangon",
    video: arcadeVideo,
    distanceGain: 0.5,
  });
  runtime.entries.set("cinemaScreen", {
    gameId: "cinemaScreen",
    video: cinemaVideo,
    distanceGain: 0.75,
  });

  try {
    runtime.setVolume(0.2);
    runtime.setTvVolume(0.6);
    assert.equal(arcadeVideo.volume, 0.1);
    assert.equal(tvVideo.volume, 0.3);
    assert.ok(Math.abs(cinemaVideo.volume - 0.45) < 1e-9);
    runtime.setTvMuted(true);
    assert.equal(tvVideo.volume, 0);
    assert.equal(cinemaVideo.volume, 0);
    assert.equal(arcadeVideo.volume, 0.1);
    assert.equal(tvVideo.muted, true);
    assert.equal(cinemaVideo.muted, true);
    assert.equal(arcadeVideo.muted, false);
    assert.deepEqual(runtime.getAudioState(), {
      volume: 0.2,
      muted: false,
      tvVolume: 0.6,
      tvMuted: true,
    });
    assert.equal(saved.get("new-yokosuka.tv-volume"), "0.6");
    assert.equal(saved.get("new-yokosuka.tv-muted"), "1");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("attract-screen disposal detaches texture listeners before media", async () => {
  const originalWindow = globalThis.window;
  const windowEvents = [];
  const fakeWindow = {
    addEventListener: (...args) => windowEvents.push(["add", ...args]),
    removeEventListener: (...args) => windowEvents.push(["remove", ...args]),
  };
  const order = [];
  let rejectPlay;
  const video = {
    paused: true,
    pause: () => order.push("pause"),
    play: () => new Promise((_resolve, reject) => {
      rejectPlay = reject;
    }),
    removeEventListener: (type, listener) => {
      order.push(`remove:${type}:${listener.name}`);
    },
    removeAttribute: (name) => order.push(`removeAttribute:${name}`),
    load: () => order.push("load"),
    set srcObject(value) {
      assert.equal(value, null);
      order.push("clearSrcObject");
    },
  };
  const runtime = runtimeWithWindow(fakeWindow);
  const entry = {
    video,
    hls: { destroy: () => order.push("hls") },
    mesh: { dispose: () => order.push("mesh") },
    material: { dispose: () => order.push("material") },
    texture: { dispose: () => order.push("texture") },
    onLoadedMetadata() {},
    onDurationChange() {},
    playPending: false,
    playBlocked: false,
    shouldPlay: true,
    disposed: false,
  };
  runtime.entries.set("hangon", entry);

  try {
    runtime.requestPlayback(entry);
    assert.equal(entry.playPending, true);
    runtime.dispose();
    rejectPlay(new DOMException("media fetch aborted", "AbortError"));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(entry.disposed, true);
    assert.equal(entry.playPending, false);
    assert.equal(entry.playBlocked, false);
    assert.deepEqual(order, [
      "pause",
      "remove:loadedmetadata:onLoadedMetadata",
      "remove:durationchange:onDurationChange",
      "mesh",
      "material",
      "texture",
      "hls",
      "clearSrcObject",
      "removeAttribute:src",
      "load",
    ]);
    assert.equal(
      windowEvents.some(([operation]) => operation === "add"),
      false,
      "a rejected play promise must not restore unlock listeners after dispose",
    );
  } finally {
    globalThis.window = originalWindow;
  }
});
