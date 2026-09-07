import assert from "node:assert/strict";
import test from "node:test";

import { PlayPresentationRuntime } from "../play/PlayPresentationRuntime.js";

function control() {
  return {
    classList: { toggle() {} },
    dataset: {},
    hidden: false,
    setAttribute() {},
  };
}

test("render presentation preserves subsystem order and updates player HUD", () => {
  const calls = [];
  const call = name => (...args) => {
    calls.push([name, ...args]);
  };
  const controller = {
    cameraYaw: 0.1,
    cameraPitch: 0.2,
    cameraDistance: 3.5,
    firstPerson: false,
    updateCamera: call("camera"),
    setMovementLocked: call("movement-lock"),
  };
  const simulation = {
    lastMovement: {
      moving: true,
      noClip: false,
      firstPerson: false,
      runToggled: true,
      autoRun: false,
    },
    lastAnimationState: "walk",
    vehicleActive: false,
    stuckHintVisible: true,
  };
  const dom = {
    forkliftTipHint: control(),
    transientNotice: control(),
    stuckHint: control(),
    noClipState: control(),
    mobileStuckButton: control(),
    runState: control(),
    autoRunState: control(),
    worldCoordinates: control(),
    worldFacing: control(),
  };
  const storyRuntime = {
    ownsPlayerPresentation: false,
    updateOverlay: call("overlay"),
    updateEventController: call("event-controller"),
    updateDiagnostics(deltaSeconds, readSnapshot) {
      calls.push(["diagnostics", deltaSeconds, readSnapshot()]);
    },
    updateFaces: call("faces"),
    updateCutscenes: call("cutscenes"),
    updateScriptedEvents: call("scripted-events"),
    updateAutomatic: call("automatic-events"),
  };
  const sceneState = {
    currentSkybox: {
      position: { copyFrom: call("skybox") },
    },
  };
  const runtime = new PlayPresentationRuntime({
    story: {
      runtime: storyRuntime,
      animation: {
        activeOneShot: null,
        tick: 0,
        accumulator: 0,
      },
      scriptedEvents: {
        status: "idle",
        diagnosticSnapshot: () => ({ status: "idle" }),
      },
      playerMotion: { readMotionStatus: () => null },
      dialogueOverlay: { active: false, interaction: null },
      roomScripts: {
        sceneState: { readNativeOperation0050Activity: () => false },
      },
      eventController: { active: null },
      cutsceneDirector: { transportState: () => ({ playing: false }) },
    },
    world: {
      runtime: {
        ready: true,
        activeWorld: { id: "dobuita", cutsceneOnly: false },
      },
      scene: { activeCamera: { position: { x: 1 } } },
      sceneState,
      scheduledActors: { update: call("scheduled-actors") },
      scheduledSceneObjects: { update: call("scene-objects") },
      interactions: { update: call("interactions") },
      travelTransitions: { finishDoor: call("finish-door") },
    },
    player: {
      getController: () => controller,
      actorRoot: {
        position: { x: 1, y: 2, z: 3 },
        rotation: { y: Math.PI / 2 },
      },
      runtime: {
        combat: { updateAnimation: call("combat-animation") },
        modelRoot: { isEnabled: () => false },
        setModelVisible: call("model-visible"),
        updateCloth: call("cloth"),
      },
      simulation,
      updateAnimation: call("player-animation"),
      persistRunToggle: call("persist-run"),
      publishPresence: call("presence"),
    },
    forklifts: {
      network: { updatePresentation: call("forklift-network") },
      cargo: {
        physics: { updatePresentation: call("cargo-presentation") },
      },
      mode: {
        applyPresentation: call("forklift-mode"),
        lastPhysicsMovement: null,
        chassisState: { tipped: false },
        state: { lift: 0 },
        runToggleBefore: null,
      },
      effects: {
        updateTireMarks: call("tire-marks"),
        endTireMarks: call("end-tire-marks"),
      },
      race: { updateHud: call("forklift-hud") },
      maximumLift: 1,
    },
    arcade: {
      performance: {
        observeFrame(...args) {
          calls.push(["arcade-performance", ...args]);
          return null;
        },
        getDebugState: () => ({}),
      },
      worldId: "arcade",
      attractScreens: { getDebugState: () => ({}) },
      lighting: { update: call("arcade-lighting") },
      debugPanel: {
        updateArcadePerformance: call("arcade-debug"),
        updateCutsceneTransport: call("cutscene-transport"),
      },
      cabinetView: {
        updateTransition(callback) {
          calls.push(["cabinet-transition"]);
          callback();
        },
        updateScreen: call("cabinet-screen"),
      },
      getGames: () => ({ active: false }),
    },
    poolRuntime: { active: false, update: call("pool") },
    multiplayerRuntime: {
      remotePlayers: { update: call("remote-players") },
    },
    dom,
    transientNotice: { active: false },
    toDegrees: radians => radians * 180 / Math.PI,
    now: () => 123,
  });

  runtime.update({
    deltaSeconds: 0.02,
    wallDeltaSeconds: 0.03,
    animationDeltaSeconds: 0.04,
    fixedStepAlpha: 0.5,
  });

  assert.deepEqual(calls.map(([name]) => name), [
    "overlay",
    "pool",
    "event-controller",
    "diagnostics",
    "arcade-performance",
    "arcade-debug",
    "remote-players",
    "forklift-network",
    "scheduled-actors",
    "faces",
    "scene-objects",
    "cargo-presentation",
    "forklift-mode",
    "camera",
    "cutscenes",
    "cutscene-transport",
    "scripted-events",
    "automatic-events",
    "combat-animation",
    "end-tire-marks",
    "model-visible",
    "player-animation",
    "cloth",
    "interactions",
    "finish-door",
    "arcade-lighting",
    "forklift-hud",
    "persist-run",
    "presence",
    "skybox",
    "cabinet-transition",
    "movement-lock",
    "cabinet-screen",
  ]);
  assert.equal(dom.stuckHint.hidden, false);
  assert.equal(dom.runState.textContent, "Run on");
  assert.equal(dom.worldCoordinates.textContent, "1.00, 2.00, 3.00");
  assert.equal(dom.worldFacing.textContent, "90.00°");
});

test("render presentation skips world-owned work until the world is ready", () => {
  const calls = [];
  const runtime = new PlayPresentationRuntime({
    story: {
      runtime: {
        updateOverlay: () => calls.push("overlay"),
        updateEventController() {},
        updateDiagnostics() {},
      },
    },
    world: {
      runtime: { ready: false, activeWorld: { id: "menu" } },
      scene: { activeCamera: null },
      sceneState: { currentSkybox: null },
    },
    player: { getController: () => null },
    forklifts: {},
    arcade: {
      worldId: "arcade",
      performance: { observeFrame: () => null, getDebugState: () => ({}) },
      attractScreens: { getDebugState: () => ({}) },
      debugPanel: { updateArcadePerformance() {} },
      cabinetView: { updateTransition() {}, updateScreen() {} },
      getGames: () => null,
    },
    poolRuntime: { update() {} },
    multiplayerRuntime: {},
    dom: {},
    transientNotice: { active: false },
    toDegrees: () => 0,
    now: () => 0,
  });

  runtime.update({
    deltaSeconds: 0,
    wallDeltaSeconds: 0,
    animationDeltaSeconds: 0,
    fixedStepAlpha: 0,
  });

  assert.deepEqual(calls, ["overlay"]);
});
