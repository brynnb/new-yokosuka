import assert from "node:assert/strict";
import test from "node:test";
import {
  fixedStepTiming,
  fixedStepInterpolationAlpha,
  PlayLoopRuntime,
  renderFrameTiming,
  renderHardwareScalingLevel,
} from "../play/PlayLoopRuntime.js";

function observable() {
  let callback = null;
  return {
    add(value) { callback = value; return value; },
    remove(value) { if (callback === value) callback = null; },
    fire() { callback?.(); },
  };
}

test("play loop preserves fixed, post-fixed, render, and disposal boundaries", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousResizeObserver = globalThis.ResizeObserver;
  const calls = [];
  const listeners = new Map();
  globalThis.window = {
    devicePixelRatio: 1,
    innerHeight: 720,
    visualViewport: { addEventListener() {}, removeEventListener() {} },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    requestAnimationFrame: callback => (callback(), 1),
    cancelAnimationFrame() {},
  };
  globalThis.document = {
    documentElement: { style: { setProperty() {} } },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() { calls.push("disconnect-resize"); }
  };
  const beforeStep = observable();
  const afterStep = observable();
  const beforeRender = observable();
  let renderLoop = null;
  let worldReady = true;
  const runtime = new PlayLoopRuntime({
    engine: {
      resize: () => {},
      getHardwareScalingLevel: () => 1,
      setHardwareScalingLevel: () => {},
      runRenderLoop: callback => { renderLoop = callback; },
      stopRenderLoop: callback => {
        assert.equal(callback, renderLoop);
        calls.push("stop-render");
      },
    },
    scene: {
      onBeforeStepObservable: beforeStep,
      onAfterStepObservable: afterStep,
      onBeforeRenderObservable: beforeRender,
    },
    canvas: { parentElement: {} },
    fixedUpdate: () => calls.push("fixed"),
    fixedPostUpdate: () => calls.push("post-fixed"),
    frameUpdate: () => calls.push("frame"),
    render: () => calls.push("render"),
    shouldRender: () => worldReady,
    dispose: () => calls.push("dispose-runtime"),
  });
  try {
    runtime.start();
    runtime.start();
    worldReady = false;
    runtime.fixedStepAccumulator = 10;
    renderLoop();
    assert.equal(runtime.fixedStepAccumulator, 0, "loading must not build simulation debt");
    assert.deepEqual(calls, [], "hidden partial worlds must not render");
    worldReady = true;
    beforeStep.fire();
    afterStep.fire();
    renderLoop();
    beforeRender.fire();
    runtime.dispose();
    runtime.dispose();
    runtime.start();
    beforeStep.fire();
    afterStep.fire();
    beforeRender.fire();
    assert.deepEqual(calls, [
      "fixed",
      "post-fixed",
      "render",
      "frame",
      "stop-render",
      "dispose-runtime",
      "disconnect-resize",
    ]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.ResizeObserver = previousResizeObserver;
  }
});

test("fixed-step rendering exposes the remaining simulation fraction", () => {
  assert.equal(fixedStepInterpolationAlpha(0, 1 / 60), 0);
  assert.ok(Math.abs(
    fixedStepInterpolationAlpha(1 / 120, 1 / 60) - 0.5,
  ) < 1e-12);
  assert.equal(fixedStepInterpolationAlpha(1, 1 / 60), 1);
});
import {
  AdaptiveResolutionController,
  adaptiveRenderPixelRatios,
} from "../play/performance/AdaptiveResolutionController.js";

test("fixed simulation timing advances every subsystem by the same step", () => {
  assert.deepEqual(fixedStepTiming(1 / 60), {
    wallDeltaSeconds: 1 / 60,
    deltaSeconds: 1 / 60,
    animationDeltaSeconds: 1 / 60,
  });
});

test("render timing bounds per-frame work but preserves presentation time", () => {
  assert.deepEqual(renderFrameTiming(2), {
    wallDeltaSeconds: 2,
    deltaSeconds: 0.25,
    animationDeltaSeconds: 2,
  });
  assert.deepEqual(renderFrameTiming(300), {
    wallDeltaSeconds: 300,
    deltaSeconds: 0.25,
    animationDeltaSeconds: 120,
  });
});

test("play renders at device density up to a two-times cap", () => {
  assert.equal(renderHardwareScalingLevel(1), 1);
  assert.equal(renderHardwareScalingLevel(1.5), 2 / 3);
  assert.equal(renderHardwareScalingLevel(2), 0.5);
  assert.equal(renderHardwareScalingLevel(3), 0.5);
  assert.equal(renderHardwareScalingLevel(undefined), 1);
});

test("adaptive resolution builds gradual quality levels for the display", () => {
  assert.deepEqual(adaptiveRenderPixelRatios(2), [2, 1.5, 1.25, 1, 0.8]);
  assert.deepEqual(adaptiveRenderPixelRatios(1.5), [1.5, 1.25, 1, 0.8]);
  assert.deepEqual(adaptiveRenderPixelRatios(1), [1, 0.8]);
});

test("adaptive resolution can be capped below high-DPI density", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
  });
  controller.setMaximumPixelRatio(1, 2);
  assert.deepEqual(controller.levels, [1, 0.8]);
  assert.equal(controller.renderPixelRatio, 1);

  controller.setMaximumPixelRatio(0.8, 2);
  assert.deepEqual(controller.levels, [0.8]);
  assert.equal(controller.renderPixelRatio, 0.8);
});

function sampleFrames(controller, fps, seconds) {
  const frames = Math.ceil(fps * seconds);
  let change = null;
  for (let index = 0; index < frames; index += 1) {
    change = controller.observeFrame(1 / fps) ?? change;
  }
  return change;
}

test("adaptive resolution reduces sustained low frame rates one step", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
  });
  const change = sampleFrames(controller, 40, 2.1);
  assert.equal(change?.reason, "reduce");
  assert.equal(controller.renderPixelRatio, 1.5);
});

test("adaptive resolution reacts faster to emergency frame rates", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
  });
  const change = sampleFrames(controller, 15, 1.1);
  assert.equal(change?.reason, "emergency-reduce");
  assert.equal(controller.renderPixelRatio, 1.5);
});

test("adaptive resolution rolls back a reduction that does not help", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
  });
  sampleFrames(controller, 40, 2.1);
  const change = sampleFrames(controller, 40, 2.1);
  assert.equal(change?.reason, "rollback-ineffective");
  assert.equal(controller.renderPixelRatio, 2);
});

test("an ineffective reduction stays blocked until a new loaded world", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
  });
  sampleFrames(controller, 40, 2.1);
  sampleFrames(controller, 40, 2.1);
  sampleFrames(controller, 30, 30);
  assert.equal(controller.renderPixelRatio, 2);
  controller.observeFrame(1 / 60, { active: false });
  sampleFrames(controller, 40, 2.1);
  assert.equal(controller.renderPixelRatio, 1.5);
});

test("adaptive resolution recovers slowly after sustained good performance", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
    minimumUsefulGainFps: 0.5,
    minimumUsefulGainRatio: 0,
  });
  sampleFrames(controller, 40, 2.1);
  sampleFrames(controller, 50, 2.1);
  assert.equal(controller.renderPixelRatio, 1.5);
  const change = sampleFrames(controller, 60, 10.1);
  assert.equal(change?.reason, "recover");
  assert.equal(controller.renderPixelRatio, 2);
});

test("adaptive resolution ignores loading and long background frames", () => {
  const controller = new AdaptiveResolutionController({
    devicePixelRatio: 2,
  });
  for (let index = 0; index < 100; index += 1) {
    controller.observeFrame(0.1, { active: false });
  }
  controller.observeFrame(5);
  assert.equal(controller.renderPixelRatio, 2);
});
