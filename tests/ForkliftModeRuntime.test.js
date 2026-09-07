import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { ForkliftModeRuntime } from "../play/forklift/ForkliftModeRuntime.js";

function createHarness() {
  const raceWorld = { id: "ma00race" };
  let world = raceWorld;
  let switching = false;
  let driving = false;
  const startSpawn = {
    id: "grid-0",
    position: new BABYLON.Vector3(4, 1, 8),
    yaw: 0.5,
  };
  const fleetRuntime = {
    entries: new Map(),
    snapshotWorldId: raceWorld.id,
    async ensureServerEntry(state) {
      const entry = {
        id: state.id,
        state: { speed: 0, steeringAngle: 0, lift: 0, wheelRoll: 0 },
        chassisState: {
          pitch: 0,
          roll: 0,
          bounce: 0,
          tipped: false,
          tippingDirection: 0,
          pitchTippingDirection: 0,
        },
        physicsLinearVelocity: BABYLON.Vector3.Zero(),
        physicsAngularVelocity: BABYLON.Vector3.Zero(),
        rig: { apply() {}, groundLiftForPose: () => 0 },
        exhaustSmoke: { start() {}, stop() {} },
        root: {
          parent: null,
          position: new BABYLON.Vector3(state.x, 0, state.z),
          rotation: BABYLON.Vector3.Zero(),
          scaling: BABYLON.Vector3.One(),
          rotationQuaternion: null,
          getAbsolutePosition() { return this.position.clone(); },
          computeWorldMatrix() {},
        },
      };
      this.entries.set(state.id, entry);
      return entry;
    },
  };
  const spawned = [];
  const sentUpdates = [];
  const applied = [];
  const race = {
    session: { status: "inactive" },
    starts: 0,
    aborts: 0,
    start() { this.starts += 1; },
    abort() { this.aborts += 1; },
    holdVehicleUntilStart: () => false,
    vehicleExited() {},
  };
  const actorRoot = {
    position: BABYLON.Vector3.Zero(),
    rotation: BABYLON.Vector3.Zero(),
  };
  const chassisPose = {
    position: BABYLON.Vector3.Zero(),
    rotationQuaternion: BABYLON.Quaternion.Identity(),
  };
  let physicsPose = null;
  const controller = {
    runToggled: true,
    resetCalls: [],
    reset(...args) { this.resetCalls.push(args); },
  };
  const runtime = new ForkliftModeRuntime({
    raceWorld,
    race,
    fleetRuntime,
    getWorld: () => world,
    isSwitchingWorld: () => switching,
    isDriving: () => driving,
    getClient: () => ({
      connected: true,
      spawnForklift: state => {
        spawned.push(state);
        return true;
      },
      sendForkliftUpdate: state => sentUpdates.push(state),
    }),
    availableForLocalEntry: entry => Boolean(entry),
    resetForRaceStart: () => true,
    applyServerState: state => applied.push(state.id),
    network: {
      occupiedIds: () => new Set(),
      syncVisibility() {},
    },
    setParked() {},
    pickWorldWithRay: () => ({
      pickedPoint: new BABYLON.Vector3(0, 0, 0),
    }),
    physicsTuning: {},
    actorRoot,
    chassisPose,
    getCargo: () => ({
      physics: {
        dynamicForkliftPose: () => physicsPose,
        hasDynamicForklift: () => false,
        deactivateDynamicForklift: () => physicsPose,
      },
    }),
    getActiveId: () => "local-forklift",
    isMounted: () => driving,
    getChassisState: () => ({ pitch: 0, roll: 0 }),
    getController: () => controller,
    modelOffset: { parent: null },
    sounds: { enter() {}, exit() {} },
    effects: { endTireMarks() {} },
    syncMode() {},
    markPresenceDirty() {},
    vehicleController: {
      cameraManuallyPositioned: false,
      orientationQuaternion: yaw => (
        BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw)
      ),
      modelOrientationQuaternion: yaw => (
        BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw + Math.PI)
      ),
      chassisStateFromPhysicsPose: () => ({ pitch: 0.2, roll: -0.1 }),
    },
    publishPresence() {},
    persistLocation() {},
    gridSpawns: [startSpawn],
  });
  return {
    applied,
    actorRoot,
    chassisPose,
    controller,
    fleetRuntime,
    race,
    runtime,
    setDriving: value => {
      driving = value;
      runtime.driving = value;
      runtime.activeId = value ? "local-forklift" : null;
    },
    setSwitching: value => { switching = value; },
    setWorld: value => { world = value; },
    setPhysicsPose: value => { physicsPose = value; },
    sentUpdates,
    spawned,
    startSpawn,
  };
}

test("race entry waits until world switching and the fleet snapshot finish", () => {
  const harness = createHarness();
  harness.setSwitching(true);
  harness.runtime.requestRaceEntry();
  assert.equal(harness.runtime.tryEnterPendingRaceForklift(), false);
  assert.equal(harness.spawned.length, 0);

  harness.setSwitching(false);
  harness.fleetRuntime.snapshotWorldId = "stale-world";
  assert.equal(harness.runtime.tryEnterPendingRaceForklift(), false);
  assert.equal(harness.spawned.length, 0);
});

test("parked forklift righting is owned by forklift mode", () => {
  const harness = createHarness();
  const entry = {
    id: "rolled",
    yaw: 0,
    state: { speed: 2, steeringAngle: 0.3, lift: 0.4, wheelRoll: 1 },
    chassisState: { tipped: true, pitch: 0, roll: Math.PI / 2 },
    coasting: true,
    righting: null,
    root: {
      position: new BABYLON.Vector3(2, 1, 3),
      rotationQuaternion: BABYLON.Quaternion.Identity(),
      getAbsolutePosition() { return this.position.clone(); },
    },
    rig: {
      chassisBounds: { minimum: { y: -0.5 } },
      groundLiftForPose: () => 0.4,
    },
  };
  assert.equal(harness.runtime.rightParked(entry), true);
  assert.equal(entry.coasting, false);
  assert.equal(entry.righting.targetState.speed, 0);
  assert.equal(entry.righting.targetState.lift, 0);
  assert.equal(entry.righting.targetPosition.y, 0.525);
  assert.equal(harness.sentUpdates.at(-1).righting, true);
});

test("forklift mode owns fixed-step physics snapshots and presentation", () => {
  const harness = createHarness();
  harness.setDriving(true);
  harness.setPhysicsPose({
    position: new BABYLON.Vector3(2, 3, 4),
    orientation: BABYLON.Quaternion.RotationAxis(
      BABYLON.Axis.Y,
      Math.PI / 2,
    ),
    linearVelocity: BABYLON.Vector3.Zero(),
    angularVelocity: BABYLON.Vector3.Zero(),
  });
  harness.runtime.capturePhysicsPose();
  harness.runtime.applyPresentation(1);

  assert.ok(harness.actorRoot.position.equalsWithEpsilon(
    new BABYLON.Vector3(2, 3, 4),
  ));
  assert.ok(Math.abs(harness.actorRoot.rotation.y - Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(harness.chassisPose.rotationQuaternion.x - 0.0997) < 0.01);

  harness.setDriving(false);
  harness.runtime.capturePhysicsPose();
  assert.equal(harness.runtime.physicsSnapshots.current, null);
});

test("forklift mode owns mounted entry and exit state", async () => {
  const harness = createHarness();
  const entry = await harness.fleetRuntime.ensureServerEntry({
    id: "mounted",
    x: 1,
    z: 2,
  });
  harness.setPhysicsPose({
    position: new BABYLON.Vector3(5, 0.5, 6),
    orientation: BABYLON.Quaternion.Identity(),
    linearVelocity: new BABYLON.Vector3(0.2, 0, 0.1),
    angularVelocity: new BABYLON.Vector3(0, 0.1, 0),
  });

  assert.equal(harness.runtime.enter(entry), true);
  assert.equal(harness.runtime.driving, true);
  assert.equal(harness.runtime.activeId, "mounted");
  assert.equal(harness.runtime.runToggleBefore, true);

  assert.equal(harness.runtime.exit(), true);
  assert.equal(harness.runtime.driving, false);
  assert.equal(harness.runtime.activeId, null);
  assert.equal(harness.runtime.rig, null);
  assert.equal(harness.runtime.runToggleBefore, null);
  assert.equal(harness.sentUpdates.at(-1).id, "mounted");
  assert.equal(harness.sentUpdates.at(-1).velocityX, 0.2);
});

test("mounted recovery resets vehicle state through the mode runtime", async () => {
  const harness = createHarness();
  const entry = await harness.fleetRuntime.ensureServerEntry({
    id: "mounted",
    x: 1,
    z: 2,
  });
  harness.runtime.enter(entry);
  harness.runtime.state.speed = 4;
  harness.runtime.chassisState.tipped = true;
  const resetPosition = new BABYLON.Vector3(8, 2, 9);

  assert.equal(harness.runtime.resetMountedAt(resetPosition, 1.25), true);
  assert.equal(harness.runtime.state.speed, 0);
  assert.equal(harness.runtime.chassisState.tipped, false);
  assert.equal(entry.state, harness.runtime.state);
  assert.equal(entry.chassisState, harness.runtime.chassisState);
  assert.equal(entry.yaw, 1.25);
  assert.deepEqual(harness.controller.resetCalls.at(-1), [
    resetPosition,
    1.25,
  ]);
});

test("a missing grid forklift is spawned and entered from server state", async () => {
  const harness = createHarness();
  harness.runtime.requestRaceEntry({ startRace: true });
  assert.equal(harness.runtime.tryEnterPendingRaceForklift(), false);
  assert.deepEqual(harness.spawned, [{
    x: harness.startSpawn.position.x,
    y: harness.startSpawn.position.y,
    z: harness.startSpawn.position.z,
    yaw: harness.startSpawn.yaw,
  }]);

  harness.runtime.onForkliftState({
    id: "server-forklift",
    worldId: "ma00race",
    x: harness.startSpawn.position.x,
    z: harness.startSpawn.position.z,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.applied, ["server-forklift", "server-forklift"]);
  assert.equal(harness.runtime.activeId, "server-forklift");
  assert.equal(harness.race.starts, 1);
  assert.equal(harness.runtime.raceEntryPending, false);
  assert.equal(harness.runtime.spawnPending, false);
});

test("leaving the race world clears every pending request", () => {
  const harness = createHarness();
  harness.runtime.requestRaceEntry({ startRace: true });
  harness.runtime.spawnPending = true;
  harness.runtime.pendingSpawnId = "forklift";
  harness.runtime.pendingSpawnTarget = harness.startSpawn;
  harness.runtime.leaveRaceWorld();
  assert.deepEqual({
    raceEntryPending: harness.runtime.raceEntryPending,
    raceStartPending: harness.runtime.raceStartPending,
    spawnPending: harness.runtime.spawnPending,
    pendingSpawnId: harness.runtime.pendingSpawnId,
    pendingSpawnTarget: harness.runtime.pendingSpawnTarget,
  }, {
    raceEntryPending: false,
    raceStartPending: false,
    spawnPending: false,
    pendingSpawnId: null,
    pendingSpawnTarget: null,
  });
});
