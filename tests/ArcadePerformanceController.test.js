import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCADE_PERFORMANCE_LEVEL,
  ArcadePerformanceController,
} from "../play/performance/ArcadePerformanceController.js";

function sampleFrames(controller, fps, seconds, options) {
  const frames = Math.ceil(fps * seconds);
  let change = null;
  for (let index = 0; index < frames; index += 1) {
    change = controller.observeFrame(1 / fps, options) ?? change;
  }
  return change;
}

test("arcade performance pauses videos before disabling lights", () => {
  const controller = new ArcadePerformanceController();

  const videoChange = sampleFrames(controller, 20, 2.1);
  assert.equal(videoChange?.reason, "disable-videos");
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS);
  assert.equal(controller.videosEnabled, false);
  assert.equal(controller.lightsEnabled, true);
  const debugState = controller.getDebugState();
  assert.deepEqual({
    ...debugState,
    lastFps: Math.round(debugState.lastFps),
  }, {
    active: true,
    level: ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS,
    levelName: "Static screens",
    videosEnabled: false,
    lightsEnabled: true,
    lastFps: 20,
    lastReason: "disable-videos",
  });

  sampleFrames(controller, 20, 2.1);
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS);

  const lightChange = sampleFrames(controller, 20, 4.2);
  assert.equal(lightChange?.reason, "disable-lights");
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.MINIMAL_LIGHTS);
  assert.equal(controller.lightsEnabled, false);
});

test("arcade performance does not degrade a stable 30 FPS room", () => {
  const controller = new ArcadePerformanceController();
  const change = sampleFrames(controller, 30, 20);
  assert.equal(change, null);
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.FULL);
});

test("arcade performance restores lights and videos slowly in that order", () => {
  const controller = new ArcadePerformanceController({
    settleSeconds: 2,
  });
  sampleFrames(controller, 20, 2.1);
  sampleFrames(controller, 20, 2.1);
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.MINIMAL_LIGHTS);

  const lightChange = sampleFrames(controller, 60, 10.1);
  assert.equal(lightChange?.reason, "restore-lights");
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS);
  assert.equal(controller.lightsEnabled, true);
  assert.equal(controller.videosEnabled, false);

  const videoChange = sampleFrames(controller, 60, 10.1);
  assert.equal(videoChange?.reason, "restore-videos");
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.FULL);
  assert.equal(controller.videosEnabled, true);
});

test("leaving the arcade immediately restores full quality", () => {
  const controller = new ArcadePerformanceController();
  sampleFrames(controller, 20, 2.1);
  const change = controller.observeFrame(1 / 60, { active: false });
  assert.equal(change?.reason, "reset");
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.FULL);
});

test("arcade performance ignores a background-tab frame", () => {
  const controller = new ArcadePerformanceController();
  controller.observeFrame(10);
  assert.equal(controller.level, ARCADE_PERFORMANCE_LEVEL.FULL);
});
