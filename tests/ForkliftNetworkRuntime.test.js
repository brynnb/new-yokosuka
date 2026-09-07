import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import {
  ForkliftNetworkRuntime,
} from "../play/forklift/ForkliftNetworkRuntime.js";

function createRuntime(overrides = {}) {
  const fleetRuntime = {
    entries: new Map(),
    snapshotWorldId: "harbor",
    ...overrides.fleetRuntime,
  };
  return new ForkliftNetworkRuntime({
    fleetRuntime,
    idPattern: /^forklift-/,
    getRemotePlayers: overrides.getRemotePlayers || (() => null),
    getClient: overrides.getClient
      || (() => ({ connected: true, identity: { id: "self" } })),
    getWorldId: () => "harbor",
    isLocallyDriving: overrides.isLocallyDriving || (() => false),
    getActiveId: overrides.getActiveId || (() => null),
    setParked: () => {},
    orientationQuaternion: (yaw) => (
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw)
    ),
    modelOrientationQuaternion: () => BABYLON.Quaternion.Identity(),
    quaternionFromNetworkState: (_, yaw) => (
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw)
    ),
    exitLocalForklift: overrides.exitLocalForklift || (() => {}),
    onLocalOwnershipLost: overrides.onLocalOwnershipLost || (() => {}),
  });
}

test("forklift network runtime converts abandoned server poses safely", () => {
  const runtime = createRuntime();
  const target = runtime.targetFromServer({
    x: 1,
    y: 2,
    z: 3,
    yaw: 0.5,
    lift: 0.4,
    expiresAtMs: 100,
    velocityX: 50,
  });
  assert.deepEqual(target.position.asArray(), [1, 2, 3]);
  assert.equal(target.state.lift, 0.4);
  assert.deepEqual(target.linearVelocity.asArray(), [0, 0, 0]);
});

test("connected clients wait for the current authoritative fleet snapshot", () => {
  const runtime = createRuntime({
    fleetRuntime: { snapshotWorldId: "dobuita" },
  });
  assert.equal(runtime.availableForLocalEntry({
    id: "forklift-1",
    networkOwnerId: "",
  }), false);
  runtime.fleetRuntime.snapshotWorldId = "harbor";
  assert.equal(runtime.availableForLocalEntry({
    id: "forklift-1",
    networkOwnerId: "",
  }), true);
});

test("disconnected clients cannot enter a locally retained forklift", () => {
  const runtime = createRuntime({
    getClient: () => ({ connected: false, identity: null }),
  });
  assert.equal(runtime.availableForLocalEntry({
    id: "forklift-1",
    networkOwnerId: "",
  }), false);
});

test("a contested local forklift is released for reassignment", () => {
  let exited = 0;
  let contestedId = null;
  const runtime = createRuntime({
    getRemotePlayers: () => ({
      players: new Map([
        ["other", { state: { vehicleId: "forklift-1" } }],
      ]),
    }),
    isLocallyDriving: () => true,
    getActiveId: () => "forklift-1",
    exitLocalForklift: () => {
      exited += 1;
    },
    onLocalOwnershipLost: (id) => {
      contestedId = id;
    },
  });

  runtime.reconcileLocalOwnership();

  assert.equal(exited, 1);
  assert.equal(contestedId, "forklift-1");
});

test("remote audio snapshots derive signed motion without one-shot history", () => {
  const position = new BABYLON.Vector3(4, 0, 8);
  const runtime = createRuntime({
    getRemotePlayers: () => ({
      occupiedVehiclePoses: () => [{
        playerId: "other",
        vehicleId: "forklift-2",
        position,
        yaw: 0,
        state: {
          vehicleLift: 1.25,
        },
      }],
    }),
  });
  runtime.fleet.set("forklift-2", {
    networkTarget: {
      linearVelocity: new BABYLON.Vector3(0, 0, -3),
    },
  });

  assert.deepEqual(runtime.audioSnapshots().map((snapshot) => ({
    id: snapshot.id,
    position: snapshot.position.asArray(),
    signedSpeed: snapshot.signedSpeed,
    lift: snapshot.lift,
    tiltAngle: snapshot.tiltAngle,
  })), [{
    id: "forklift-2",
    position: [4, 0, 8],
    signedSpeed: -3,
    lift: 1.25,
    tiltAngle: 0,
  }]);
});
