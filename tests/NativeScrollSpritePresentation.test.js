import * as BABYLON from "@babylonjs/core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeScrollSpritePresentation,
} from "../play/events/NativeScrollSpritePresentation.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

test("scroll presentation owns native extension slots and follows slot release", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const assets = new Map([
    ["SCROLL53.SCR1", readFileSync("play/assets/introduction/op02/SCROLL53.SCR1")],
    ["SCROLL67.SCR0", readFileSync("play/assets/introduction/op02/SCROLL67.SCR0")],
  ]);
  const skybox = new BABYLON.TransformNode("ordinary-sky", scene);
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [
      { path: "SCROLL53.SCR1", width: 512, height: 256 },
      { path: "SCROLL67.SCR0", width: 512, height: 320 },
    ],
    loadAsset: async path => assets.get(path),
    getSkybox: () => skybox,
    getDeltaFrames: () => 1,
  });
  const state = createNativeSceneGameplayState();
  state.scrollSpriteControlState.configureSlot(1, {
    active: false,
    transition: { controlMode: 7, duration: 9 },
  });
  const owner = { kind: "test-scroll-owner" };

  await presentation.load();
  assert.equal(presentation.resources.length, 2);
  assert.deepEqual(
    presentation.resources.map(resource => [
      resource.parsed.slotIndex,
      resource.parsed.width,
      resource.parsed.height,
      resource.layer.isEnabled,
    ]),
    [[0, 512, 320, false], [1, 512, 256, false]],
  );
  assert.equal(skybox.isEnabled(), true);

  assert.equal(presentation.begin(owner, state), true);
  assert.deepEqual(
    presentation.resources.map(resource => resource.layer.isEnabled),
    [true, false],
  );
  assert.equal(skybox.isEnabled(), false);

  state.scrollSpriteControlState.releaseSlot({ slotIndex: 0, cleanupMode: 0 });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.deepEqual(
    presentation.resources.map(resource => resource.layer.isEnabled),
    [false, true],
  );
  assert.equal(skybox.isEnabled(), false);

  state.scrollSpriteControlState.releaseSlot({ slotIndex: 1, cleanupMode: 0 });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(skybox.isEnabled(), true);

  assert.equal(presentation.end(owner), true);
  assert.equal(skybox.isEnabled(), true);
  assert.deepEqual(state.scrollSpriteControlState.readSlot(0), {
    active: false,
    transition: null,
    resource: null,
  });
  assert.deepEqual(state.scrollSpriteControlState.readSlot(1), {
    active: false,
    transition: { controlMode: 7, duration: 9 },
    resource: null,
  });
  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation crossfades to the requested native slot", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const assets = new Map([
    ["SCROLL53.SCR1", readFileSync("play/assets/introduction/op02/SCROLL53.SCR1")],
    ["SCROLL67.SCR0", readFileSync("play/assets/introduction/op02/SCROLL67.SCR0")],
  ]);
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [
      { path: "SCROLL53.SCR1" },
      { path: "SCROLL67.SCR0" },
    ],
    loadAsset: async path => assets.get(path),
    getDeltaFrames: () => 1,
  });
  const state = createNativeSceneGameplayState();
  const owner = { kind: "test-scroll-transition-owner" };
  await presentation.load();
  presentation.begin(owner, state);

  state.scrollSpriteControlState.requestTransition({
    slotIndex: 1,
    controlMode: 0,
    duration: 4,
  });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.deepEqual(
    presentation.resources.map(resource => [
      resource.layer.isEnabled,
      resource.layer.color.a,
    ]),
    [[true, 0.75], [true, 0.25]],
  );
  scene.onBeforeRenderObservable.notifyObservers(scene);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.deepEqual(
    presentation.resources.map(resource => [
      resource.layer.isEnabled,
      resource.layer.color.a,
    ]),
    [[false, 0], [true, 1]],
  );

  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation keeps its backdrop registered to camera motion", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const cameraView = {
    yaw: 0,
    pitch: 0,
    verticalFov: Math.PI / 2,
    aspectRatio: 4 / 3,
  };
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{ path: "SCROLL67.SCR0" }],
    loadAsset: async () => readFileSync(
      "play/assets/introduction/op02/SCROLL67.SCR0",
    ),
    getCameraView: () => cameraView,
  });
  const state = createNativeSceneGameplayState();
  const owner = { kind: "test-scroll-camera-owner" };
  await presentation.load();
  presentation.begin(owner, state);
  assert.equal(presentation.resources[0].texture.vOffset, 0);

  cameraView.pitch = Math.PI / 8;
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.ok(
    presentation.resources[0].texture.vOffset > 0.2,
    "looking upward must move the authored horizon down the screen",
  );

  presentation.beginActivity();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(presentation.resources[0].texture.vOffset, 0);

  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation rotates with authored camera roll", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera(
    "authored-roll-camera",
    BABYLON.Vector3.Zero(),
    scene,
  );
  camera.setTarget(new BABYLON.Vector3(0, 0, 1));
  camera.upVector.copyFrom(BABYLON.Axis.Y);
  scene.activeCamera = camera;
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{ path: "SCROLL67.SCR0" }],
    loadAsset: async () => readFileSync(
      "play/assets/introduction/op02/SCROLL67.SCR0",
    ),
  });
  const state = createNativeSceneGameplayState();
  const owner = { kind: "test-scroll-camera-roll-owner" };
  await presentation.load();
  presentation.begin(owner, state);
  camera.upVector.copyFrom(BABYLON.Vector3.TransformNormal(
    BABYLON.Axis.Y,
    BABYLON.Matrix.RotationZ(0.2),
  ));
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.ok(
    Math.abs(presentation.resources[0].texture.wAng + 0.2) < 1e-7,
    String(presentation.resources[0].texture.wAng),
  );

  presentation.beginActivity();
  assert.equal(presentation.resources[0].texture.wAng, 0);
  presentation.end(owner);
  assert.equal(presentation.resources[0].texture.wAng, 0);
  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation can widen horizontal coverage for panoramic shots", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const cameraView = {
    yaw: 0,
    pitch: 0,
    verticalFov: Math.PI / 2,
    aspectRatio: 4 / 3,
  };
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{
      path: "SCROLL67.SCR0",
      horizontalCoverageScale: 2,
    }],
    loadAsset: async () => readFileSync(
      "play/assets/introduction/op02/SCROLL67.SCR0",
    ),
    getCameraView: () => cameraView,
  });
  const state = createNativeSceneGameplayState();
  const owner = { kind: "test-scroll-wide-coverage-owner" };
  await presentation.load();
  presentation.begin(owner, state);
  cameraView.yaw = Math.PI / 8;
  scene.onBeforeRenderObservable.notifyObservers(scene);

  const horizontalFov = 2 * Math.atan(
    Math.tan(cameraView.verticalFov / 2) * cameraView.aspectRatio,
  );
  const ordinaryOffset = Math.tan(cameraView.yaw)
    / Math.tan(horizontalFov / 2)
    / 2;
  const actualOffset = presentation.resources[0].texture.uOffset;
  assert.ok(
    Math.abs(actualOffset - ordinaryOffset / 2) < 1e-6,
    `${actualOffset} != ${ordinaryOffset / 2}`,
  );

  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation can continue past horizontal image edges without clamping", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{
      path: "SCROLL67.SCR0",
      horizontalWrap: "mirror",
    }],
    loadAsset: async () => readFileSync(
      "play/assets/introduction/op02/SCROLL67.SCR0",
    ),
  });

  await presentation.load();
  assert.equal(
    presentation.resources[0].texture.wrapU,
    BABYLON.Texture.MIRROR_ADDRESSMODE,
  );
  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation applies package-specific vertical framing", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{
      path: "SCROLL67.SCR0",
      textureOffsetY: -0.2,
    }],
    loadAsset: async () => readFileSync(
      "play/assets/introduction/op02/SCROLL67.SCR0",
    ),
    getCameraView: () => null,
  });
  const state = createNativeSceneGameplayState();
  const owner = { kind: "test-scroll-framing-owner" };
  await presentation.load();
  presentation.begin(owner, state);
  assert.equal(presentation.resources[0].texture.vOffset, -0.2);
  presentation.beginActivity();
  assert.equal(presentation.resources[0].texture.vOffset, -0.2);
  presentation.end(owner);
  assert.equal(presentation.resources[0].texture.vOffset, 0);
  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation can replace native pixels without replacing native slot data", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const requestedUrls = [];
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{
      path: "SCROLL67.SCR0",
      imagePath: "SCROLL67.png",
      width: 512,
      height: 320,
    }],
    loadAsset: async () => readFileSync(
      "play/assets/introduction/op02/SCROLL67.SCR0",
    ),
    resolveAssetUrl: imagePath => {
      requestedUrls.push(imagePath);
      return "/assets/SCROLL67.upscaled.png";
    },
    createImageTexture: async (targetScene, definition, parsed, resolveUrl) => {
      const url = resolveUrl(definition.imagePath);
      requestedUrls.push(url);
      const texture = BABYLON.RawTexture.CreateRGBATexture(
        new Uint8Array(4 * 4 * 4),
        4,
        4,
        targetScene,
      );
      return { parsed, texture };
    },
  });

  await presentation.load();
  assert.deepEqual(requestedUrls, [
    "SCROLL67.png",
    "/assets/SCROLL67.upscaled.png",
  ]);
  assert.equal(presentation.resources[0].parsed.slotIndex, 0);
  assert.equal(presentation.resources[0].parsed.width, 512);
  assert.equal(presentation.resources[0].parsed.height, 320);
  presentation.clear();
  scene.dispose();
  engine.dispose();
});

test("scroll presentation rejects two resources that claim one native slot", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  assert.throws(
    () => createNativeScrollSpritePresentation({
      scene,
      definitions: [
        { path: "SCROLL53.SCR1" },
        { path: "SCROLL54.SCR1" },
      ],
      loadAsset: async () => new ArrayBuffer(0),
    }),
    /slot 1 is duplicated/,
  );
  scene.dispose();
  engine.dispose();
});

test("script-allocated scroll resources remain hidden until their operation", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const presentation = createNativeScrollSpritePresentation({
    scene,
    definitions: [{
      path: "SCROLL25.SPR",
      nativeSlot: 0,
      lifecycle: "script-allocated",
    }],
    loadAsset: async () => readFileSync("play/assets/hazuki/hihy/SCROLL25.SPR"),
  });
  const state = createNativeSceneGameplayState();
  const owner = { kind: "script-scroll-owner" };
  await presentation.load();
  presentation.begin(owner, state);
  assert.equal(presentation.resources[0].layer.isEnabled, false);
  state.scrollSpriteControlState.allocateSlot({
    slotIndex: 0,
    path: "scroll",
    name: "SCROLL25.SPR",
    resource: { kind: "test-resource" },
  });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(presentation.resources[0].layer.isEnabled, true);
  presentation.clear();
  scene.dispose();
  engine.dispose();
});
