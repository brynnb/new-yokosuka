import assert from "node:assert/strict";
import test from "node:test";

import { PlaySimulationRuntime } from "../play/PlaySimulationRuntime.js";
import * as BABYLON from "@babylonjs/core";
import { ThirdPersonController, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS } from "../src/ThirdPersonController.js";
import { PlayInputRuntime } from "../play/input/PlayInputRuntime.js";

function createRuntime(overrides = {}) {
  const calls = [];
  const movement = {
    moving: true,
    noClip: false,
    firstPerson: false,
    runToggled: true,
  };
  const controller = {
    collider: { position: { x: 2, y: 3, z: 4 } },
    update(deltaSeconds, options) {
      calls.push(["controller", deltaSeconds, options]);
      return movement;
    },
  };
  const physics = {
    syncForkliftPoses(entries, activeId, excludedIds) {
      calls.push(["cargo-sync", entries, activeId, excludedIds]);
    },
    simulate: deltaSeconds => calls.push(["cargo-simulate", deltaSeconds]),
    needsSimulation: () => true,
  };
  const runtime = new PlaySimulationRuntime({
    scene: { physicsEnabled: false },
    worldRuntime: {
      ready: true,
      activeWorld: {
        id: "dobuita",
        nativeArea: "D000",
        collisionArea: "D000",
        cutsceneOnly: false,
      },
    },
    ownsPlayerPresentation: () => false,
    getController: () => controller,
    actorRoot: { position: { x: 5, y: 6, z: 7 } },
    playerRuntime: {
      combat: {
        active: true,
        controlsActive: true,
        playerMovementLocked: false,
        playerTargetYaw: () => 1.25,
        update: deltaSeconds => calls.push(["combat", deltaSeconds]),
        playerAnimationState: () => "combatWalk",
      },
    },
    playInput: {
      snapshot(options) {
        calls.push(["input", options]);
        return { forward: 1 };
      },
    },
    mobileControls: { kind: "mobile" },
    nativeActorTag: () => "AKIR",
    cinemaSeatInteractions: {
      update: () => calls.push(["cinema"]),
    },
    worldSounds: {
      setMovement: value => calls.push(["movement-sound", value]),
    },
    forkliftNetwork: {
      simulate: deltaSeconds => calls.push(["network", deltaSeconds]),
      syncRemoteCollisionPoses: () => calls.push(["remote-collision"]),
      audioSnapshots: () => [{ id: "remote" }],
    },
    forkliftModeRuntime: {
      driving: false,
      rig: null,
      activeId: null,
    },
    forkliftRace: {
      simulate: deltaSeconds => calls.push(["race", deltaSeconds]),
    },
    forkliftFleet: new Map([
      ["parked", { id: "parked", righting: true }],
    ]),
    forkliftCargo: { physics },
    remoteForkliftSounds: {
      update: (...args) => calls.push(["remote-sound", ...args]),
    },
    travelTransitions: {
      updateBoundary: (...args) => calls.push(["boundary", ...args]),
    },
    stuckMovementDetector: {
      update: options => {
        calls.push(["stuck", options]);
        return true;
      },
    },
    recoverPlayerFromVoid: () => calls.push(["recover"]),
    persistPlayerLocation: () => calls.push(["persist"]),
    stateForMovement: () => "walk",
    now: () => 100,
    ...overrides,
  });
  return { calls, controller, movement, physics, runtime };
}

test("fixed simulation preserves gameplay update order and publishes state", () => {
  const { calls, runtime } = createRuntime();

  runtime.update({ deltaSeconds: 0.5 });

  assert.deepEqual(calls.map(([name]) => name), [
    "network",
    "input",
    "controller",
    "cinema",
    "combat",
    "movement-sound",
    "race",
    "recover",
    "boundary",
    "remote-collision",
    "remote-sound",
    "cargo-sync",
    "cargo-simulate",
    "stuck",
    "persist",
  ]);
  assert.equal(runtime.scene.physicsEnabled, true);
  assert.equal(runtime.lastMovement.moving, true);
  assert.equal(runtime.lastAnimationState, "combatWalk");
  assert.equal(runtime.movementState, "combatWalk");
  assert.equal(runtime.vehicleActive, false);
  assert.equal(runtime.stuckHintVisible, true);
  assert.deepEqual(calls[2][2], {
    lockMovement: false,
    updateCamera: false,
    movementTargetYaw: 1.25,
    actorFacingYaw: 1.25,
    directionalDash: true,
    targetRelativeBackwardMultiplier: 3,
    inputSnapshot: { forward: 1 },
  });
  assert.equal(calls[5][1].nativeActorTag, "AKIR");
  assert.deepEqual(calls[11][3], ["parked"]);
});

test("inactive combat cannot turn exploration keyboard input into orbiting strafes", () => {
  for (const [active, controlsActive] of [[false, false], [false, true], [true, false]]) {
    for (const firstPerson of [false, true]) {
      for (const [key, direction] of [["KeyA", -1], ["KeyD", 1]]) {
        const { runtime } = createRuntime();
        const controller = Object.assign(Object.create(ThirdPersonController.prototype), {
          options: { ...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS },
          keys: new Set(), touchInput: { x: 0, y: 0, magnitude: 0 },
          firstPerson, cameraYaw: 0, lastActorYaw: Math.PI,
          stationaryTurnRemainingSeconds: 0,
          actorRoot: { position: BABYLON.Vector3.Zero(), rotation: { y: Math.PI } },
          collider: { position: BABYLON.Vector3.Zero() },
          snapToTerrain: () => null, advanceVertical: () => null,
          recordSafePosition() {},
          moveHorizontal() { assert.fail("Turning in place must not translate the player"); },
        });
        runtime.getController = () => controller;
        runtime.playInput = new PlayInputRuntime({ getBinding: () => null });
        runtime.playInput.actions.setButton("keyboard", key, true);
        Object.assign(runtime.playerRuntime.combat, {
          active, controlsActive,
          playerTargetYaw() { assert.fail("Inactive combat must not supply a target angle"); },
        });
        runtime.update({ deltaSeconds: 1 / 60 });
        assert.equal(runtime.lastMovement.moving, false);
        assert.equal(Math.sign(controller.cameraYaw), direction);
        assert.deepEqual(controller.collider.position.asArray(), [0, 0, 0]);
      }
    }
  }
});

test("simulation pauses while the world or authored presentation owns play", () => {
  const unavailable = createRuntime({
    worldRuntime: {
      ready: false,
      activeWorld: { cutsceneOnly: false },
    },
  });
  unavailable.runtime.update({ deltaSeconds: 1 / 60 });
  assert.deepEqual(unavailable.calls, []);
  assert.equal(unavailable.runtime.scene.physicsEnabled, false);

  const presentation = createRuntime({
    ownsPlayerPresentation: () => true,
  });
  presentation.runtime.lastMovement = { moving: true };
  presentation.runtime.vehicleActive = true;
  presentation.runtime.update({ deltaSeconds: 1 / 60 });
  assert.deepEqual(presentation.calls, []);
  assert.equal(presentation.runtime.lastMovement, null);
  assert.equal(presentation.runtime.vehicleActive, false);
});

test("world reset clears transient presentation state", () => {
  const { runtime } = createRuntime();
  runtime.lastMovement = { moving: true };
  runtime.vehicleActive = true;
  runtime.stuckHintVisible = true;

  runtime.resetWorldState();

  assert.equal(runtime.lastMovement, null);
  assert.equal(runtime.vehicleActive, false);
  assert.equal(runtime.stuckHintVisible, false);
});
