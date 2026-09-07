import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  CARGO_AUTO_RIGHT_SECONDS,
  CARGO_CONTACT_RELEASE_SECONDS,
  FORKLIFT_LOAD_BACKREST,
  FORKLIFT_CARGO_COLLISION_GROUPS,
  FORKLIFT_ENTRY_SETTLE_SECONDS,
  cargoBottomFacesDown,
  cargoColliderBands,
  cargoContactSupportsFromBelow,
  cargoMembershipWithForkSupport,
  cargoNearSupportBelow,
  cargoRestingPoseOnSupport,
  cargoSupportedByForklift,
  collisionGroupsCanCollide,
  constrainedForkLateralVelocity,
  constrainedForkLongitudinalVelocity,
  constrainedForkVerticalVelocity,
  forkliftCenterOfMass,
  forkliftChassisFriction,
  forkliftBodyCollideMask,
  forkliftCompoundTineCollideMask,
  forkliftCompoundTineTranslation,
  forkliftConstrainedLift,
  forkliftDriveAcceleration,
  forkliftEntryIsSettling,
  forkliftAntiRollForce,
  forkliftSuspensionForce,
  forkliftTireSlipSpeed,
  forkTineCollisionEnabled,
  orientedBoxesIntersect,
} from "../src/ForkliftCargoPhysics.js";

test("forklift speed controller converges without bang-bang corrections", () => {
  const options = {
    targetSpeed: 9,
    gain: 2.4,
    damping: 0.18,
    maximumDriveAcceleration: 6.4,
    maximumBrakeAcceleration: 20,
  };
  assert.equal(forkliftDriveAcceleration({
    ...options,
    forwardSpeed: 0,
  }), 6.4);
  const nearTarget = forkliftDriveAcceleration({
    ...options,
    forwardSpeed: 8.9,
    filteredAcceleration: 0.1,
  });
  assert.ok(nearTarget > 0 && nearTarget < 0.25);
  assert.ok(forkliftDriveAcceleration({
    ...options,
    forwardSpeed: 9.1,
  }) < 0);
});

test("forklift suspension supports compression and damps wheel motion", () => {
  const resting = forkliftSuspensionForce({
    hitDistance: 0.46,
    restLength: 0.56,
    stiffness: 80000,
    damping: 9000,
    normalSpeed: 0,
    maximumForce: 32000,
  });
  assert.ok(Math.abs(resting - 8000) < 1e-9);
  assert.ok(forkliftSuspensionForce({
    hitDistance: 0.46,
    restLength: 0.56,
    stiffness: 80000,
    damping: 9000,
    normalSpeed: -0.5,
    maximumForce: 32000,
  }) > resting);
  assert.equal(forkliftSuspensionForce({
    hitDistance: 0.6,
    restLength: 0.56,
  }), 0);
});

test("anti-roll bar transfers load only while both wheels support it", () => {
  const force = forkliftAntiRollForce({
    leftCompression: 0.12,
    rightCompression: 0.08,
    stiffness: 60000,
    leftSupportForce: 10000,
    rightSupportForce: 8000,
  });
  assert.ok(Math.abs(force - 2400) < 1e-9);
  assert.equal(forkliftAntiRollForce({
    leftCompression: 0.3,
    rightCompression: 0,
    stiffness: 60000,
    leftSupportForce: 12000,
    rightSupportForce: 900,
  }), 900);
  assert.equal(forkliftAntiRollForce({
    leftCompression: 0.12,
    rightCompression: 0.08,
    stiffness: 60000,
    leftSupportForce: 10000,
    rightSupportForce: 0,
  }), 0);
  assert.equal(forkliftAntiRollForce({
    leftCompression: 0.08,
    rightCompression: 0.12,
    stiffness: 60000,
    leftSupportForce: 700,
    rightSupportForce: 10000,
  }), -700);
});

test("forklift tire slip combines sideways travel and steering scrub", () => {
  assert.equal(forkliftTireSlipSpeed(0, 1, 1), 0);
  assert.equal(forkliftTireSlipSpeed(-0.4, 1, 1), 0.4);
  assert.ok(forkliftTireSlipSpeed(0, 0, 1) > 0);
  assert.ok(forkliftTireSlipSpeed(0.4, 0, 1) > 0.4);
});

test("forklift entry holds physics for one second before release", () => {
  const enteredAt = 4;
  const settleUntil = enteredAt + FORKLIFT_ENTRY_SETTLE_SECONDS;
  assert.equal(forkliftEntryIsSettling(settleUntil, enteredAt), true);
  assert.equal(
    forkliftEntryIsSettling(settleUntil, settleUntil - 0.001),
    true,
  );
  assert.equal(forkliftEntryIsSettling(settleUntil, settleUntil), false);
});

test("forklift chassis gains ground friction after tipping", () => {
  const upright = forkliftChassisFriction(1, 0.06);
  const tipped = forkliftChassisFriction(0.2, upright);
  assert.ok(tipped > upright);
  assert.equal(
    forkliftChassisFriction(0.7, tipped),
    tipped,
    "friction remains high in the hysteresis band",
  );
  assert.equal(
    forkliftChassisFriction(0.9, tipped),
    upright,
    "friction returns to tire-controlled mode after righting",
  );
});

test("compound tine colliders move with the authored fork lift", () => {
  const lowered = forkliftCompoundTineTranslation(-0.498, 0);
  const raised = forkliftCompoundTineTranslation(-0.498, 1.25);
  assert.equal(lowered.x, raised.x);
  assert.equal(lowered.z, raised.z);
  assert.equal(raised.y - lowered.y, 1.25);
  assert.ok(lowered.z > 1, "model-facing correction places tines forward");
});

test("compound tines thread at zero and contact cargo when raised", () => {
  const groups = FORKLIFT_CARGO_COLLISION_GROUPS;
  const lowered = forkliftCompoundTineCollideMask(0);
  const raised = forkliftCompoundTineCollideMask(0.5);
  assert.ok(lowered & groups.ground);
  assert.equal(lowered & groups.cargoUpper, 0);
  assert.ok(raised & groups.ground);
  assert.ok(raised & groups.cargoUpper);
});

test("constrained fork lift is measured along the tilted chassis mast", () => {
  const orientation = BABYLON.Quaternion.RotationYawPitchRoll(
    0.4,
    -0.25,
    0.1,
  );
  const chassis = new BABYLON.Vector3(4, 2, -3);
  const relative = forkliftCompoundTineTranslation(0, 1.35);
  const fork = chassis.add(BABYLON.Vector3.TransformNormal(
    relative,
    BABYLON.Matrix.FromQuaternionToRef(
      orientation,
      BABYLON.Matrix.Identity(),
    ),
  ));
  assert.ok(Math.abs(
    forkliftConstrainedLift(chassis, fork, orientation) - 1.35,
  ) < 1e-6);
});

test("a forward load increases rearward stability as it is raised", () => {
  const unloaded = forkliftCenterOfMass({
    baseHeight: 0.68,
    load: 0,
    lift: 1,
    loadInfluence: 1,
  });
  const loaded = forkliftCenterOfMass({
    baseHeight: 0.68,
    load: 1,
    lift: 1,
    loadInfluence: 1,
  });
  const unloadedHeight = unloaded.y + 0.875;
  const loadedHeight = loaded.y + 0.875;
  const rearwardThreshold = (center) => (
    (0.52 + center.z) / (center.y + 0.875)
  );
  const forwardThreshold = (center) => (
    (0.52 - center.z) / (center.y + 0.875)
  );
  assert.ok(loaded.y > unloaded.y);
  assert.ok(loaded.z > unloaded.z);
  assert.ok(loadedHeight > unloadedHeight);
  assert.ok(
    rearwardThreshold(loaded) > rearwardThreshold(unloaded),
    "the forward load must make a backward tip harder",
  );
  assert.ok(
    forwardThreshold(loaded) < forwardThreshold(unloaded),
    "the forward load must make a forward tip easier",
  );
});

test("cargo reserves exactly its bottom ten percent for fork insertion", () => {
  const dimensions = new BABYLON.Vector3(1.2, 1, 1.1);
  const bands = cargoColliderBands(dimensions);
  assert.equal(bands.lower.extents.y, 0.1);
  assert.equal(bands.upper.extents.y, 0.9);
  const lowerBottom = bands.lower.center.y - bands.lower.extents.y / 2;
  const lowerTop = bands.lower.center.y + bands.lower.extents.y / 2;
  const upperBottom = bands.upper.center.y - bands.upper.extents.y / 2;
  const upperTop = bands.upper.center.y + bands.upper.extents.y / 2;
  assert.ok(Math.abs(lowerBottom + 0.5) < 1e-12);
  assert.ok(Math.abs(lowerTop - upperBottom) < 1e-12);
  assert.ok(Math.abs(upperTop - 0.5) < 1e-12);
});

test("fork tines pass through the lower cargo band but support the upper band", () => {
  const groups = FORKLIFT_CARGO_COLLISION_GROUPS;
  const all = Object.values(groups).reduce((mask, value) => mask | value, 0);
  const lowerCollide = all & ~groups.forkliftTine;
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftTine,
    groups.cargoUpper,
    groups.cargoLower,
    lowerCollide,
  ), false);
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftTine,
    groups.cargoUpper,
    groups.cargoUpper,
    all,
  ), true);
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftSupport,
    groups.forkSupportedCargo,
    groups.cargoLower,
    all,
  ), false);
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftSupport,
    groups.forkSupportedCargo,
    cargoMembershipWithForkSupport(groups.cargoLower, true),
    all,
  ), true);
});

test("forklift chassis and tines collide with other forklifts", () => {
  const groups = FORKLIFT_CARGO_COLLISION_GROUPS;
  const bodyCollide = forkliftBodyCollideMask();
  const loweredTineCollide = forkliftCompoundTineCollideMask(0);

  assert.equal(collisionGroupsCanCollide(
    groups.forkliftBody,
    bodyCollide,
    groups.forkliftBody,
    bodyCollide,
  ), true);
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftTine,
    loweredTineCollide,
    groups.forkliftBody,
    bodyCollide,
  ), true);
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftTine,
    loweredTineCollide,
    groups.cargoUpper,
    Object.values(groups).reduce((mask, value) => mask | value, 0),
  ), false);
});

test("fork support passes through a stack and holds only carried cargo", () => {
  const groups = FORKLIFT_CARGO_COLLISION_GROUPS;
  const all = Object.values(groups).reduce((mask, value) => mask | value, 0);
  const ordinaryCargo = cargoMembershipWithForkSupport(
    groups.cargoLower,
    false,
  );
  const carriedCargo = cargoMembershipWithForkSupport(
    groups.cargoLower,
    true,
  );
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftSupport,
    groups.forkSupportedCargo,
    ordinaryCargo,
    all,
  ), false);
  assert.equal(collisionGroupsCanCollide(
    groups.forkliftSupport,
    groups.forkSupportedCargo,
    carriedCargo,
    all,
  ), true);
  assert.equal(collisionGroupsCanCollide(
    ordinaryCargo,
    all,
    carriedCargo,
    all,
  ), true);
});

test("lowering detects a supporting box before the hidden fork plate hits", () => {
  const orientation = BABYLON.Quaternion.Identity();
  const halfExtents = new BABYLON.Vector3(0.6, 0.5, 0.55);
  const lower = {
    position: BABYLON.Vector3.Zero(),
    orientation,
    halfExtents,
  };
  const upper = {
    position: new BABYLON.Vector3(0, 1.12, 0),
    orientation,
    halfExtents,
  };
  assert.equal(cargoNearSupportBelow(upper, lower), true);
  assert.equal(cargoNearSupportBelow({
    ...upper,
    position: new BABYLON.Vector3(0, 1.2, 0),
  }, lower), false);
  assert.equal(cargoNearSupportBelow({
    ...upper,
    position: new BABYLON.Vector3(1.3, 1.12, 0),
  }, lower), false);
  assert.equal(cargoNearSupportBelow(lower, upper), false);
});

test("stack transfer places cargo flush on its support without penetration", () => {
  const cargo = {
    position: new BABYLON.Vector3(0.1, 1.56, -0.1),
    orientation: BABYLON.Quaternion.RotationYawPitchRoll(
      0.3,
      0.05,
      -0.04,
    ),
    halfExtents: new BABYLON.Vector3(0.6, 0.5, 0.55),
  };
  const support = {
    position: new BABYLON.Vector3(0, 0.5, 0),
    orientation: BABYLON.Quaternion.Identity(),
    halfExtents: new BABYLON.Vector3(0.6, 0.5, 0.55),
  };
  const pose = cargoRestingPoseOnSupport(cargo, support);
  assert.ok(pose);
  assert.equal(pose.position.x, cargo.position.x);
  assert.equal(pose.position.z, cargo.position.z);
  assert.ok(pose.position.y > 1.5);
  assert.ok(pose.position.y < 1.51);
  assert.ok(cargoBottomFacesDown(pose.orientation));
  assert.equal(
    cargoRestingPoseOnSupport({
      ...cargo,
      position: new BABYLON.Vector3(2, 1.56, 0),
    }, support),
    null,
  );
});

test("a pallet engages only after both tines reach its lower center", () => {
  const cargo = {
    position: BABYLON.Vector3.Zero(),
    orientation: BABYLON.Quaternion.Identity(),
    dimensions: new BABYLON.Vector3(1.02, 1.02, 1.02),
  };
  const tine = (x, z = 0) => ({
    position: new BABYLON.Vector3(x, -0.45, z),
    orientation: BABYLON.Quaternion.Identity(),
    halfExtents: new BABYLON.Vector3(0.06, 0.0275, 0.545),
  });
  assert.equal(cargoSupportedByForklift(
    cargo,
    [tine(-0.49), tine(0.49)],
  ), true);
  assert.equal(cargoSupportedByForklift(
    cargo,
    [tine(-0.49), tine(0.49, 0.7)],
  ), false);
  assert.equal(cargoSupportedByForklift(
    cargo,
    [tine(-0.49)],
  ), false);
});

test("a yawed pallet engages across an aligned fork pair", () => {
  const cargo = {
    position: BABYLON.Vector3.Zero(),
    orientation: BABYLON.Quaternion.RotationAxis(
      BABYLON.Axis.Y,
      Math.PI / 4,
    ),
    dimensions: new BABYLON.Vector3(1.02, 1.02, 1.02),
  };
  const tine = (x) => ({
    position: new BABYLON.Vector3(x, -0.45, 0.5),
    orientation: BABYLON.Quaternion.Identity(),
    halfExtents: new BABYLON.Vector3(0.06, 0.0275, 0.545),
  });
  assert.equal(cargoSupportedByForklift(
    cargo,
    [tine(-0.49), tine(0.49)],
  ), true);
});

test("lowered empty tines thread through a pallet before lifting", () => {
  assert.equal(forkTineCollisionEnabled(0, false), false);
  assert.equal(forkTineCollisionEnabled(0.005, false), false);
  assert.equal(forkTineCollisionEnabled(0.02, false), true);
  assert.equal(forkTineCollisionEnabled(0, true), false);
  assert.equal(forkTineCollisionEnabled(0.005, true), true);
});

test("the load backrest closes the gap between tines and cab", () => {
  const tineRear = -1.213 + 1.09 / 2;
  const backrestFront = (
    FORKLIFT_LOAD_BACKREST.center.z
    - FORKLIFT_LOAD_BACKREST.dimensions.z / 2
  );
  const backrestRear = (
    FORKLIFT_LOAD_BACKREST.center.z
    + FORKLIFT_LOAD_BACKREST.dimensions.z / 2
  );
  const chassisFront = 0.08 - 1.35 / 2;
  assert.ok(Math.abs(tineRear - backrestFront) < 0.005);
  assert.ok(backrestRear >= chassisFront);
  assert.ok(
    FORKLIFT_LOAD_BACKREST.center.y
      - FORKLIFT_LOAD_BACKREST.dimensions.y / 2
    <= 0.105,
  );
});

test("supported cargo loses lateral speed but keeps lift and fork travel", () => {
  const velocity = constrainedForkLateralVelocity({
    cargoPosition: new BABYLON.Vector3(0.2, 1, -0.4),
    cargoVelocity: new BABYLON.Vector3(1, 2, 3),
    supportPosition: BABYLON.Vector3.Zero(),
    supportOrientation: BABYLON.Quaternion.Identity(),
    lateralOffset: 0,
  });
  assert.ok(Math.abs(velocity.x + 3.6) < 1e-12);
  assert.equal(velocity.y, 2);
  assert.equal(velocity.z, 3);
});

test("supported cargo cannot acquire upward launch velocity", () => {
  const stationary = constrainedForkVerticalVelocity({
    cargoPosition: new BABYLON.Vector3(0, 0.54, 0),
    cargoVelocity: new BABYLON.Vector3(0, 9, 0),
    supportPosition: BABYLON.Vector3.Zero(),
    supportOrientation: BABYLON.Quaternion.Identity(),
    expectedVerticalOffset: 0.54,
    supportVerticalSpeed: 0,
  });
  assert.equal(stationary.y, 0);

  const lifting = constrainedForkVerticalVelocity({
    cargoPosition: new BABYLON.Vector3(0, 0.53, 0),
    cargoVelocity: new BABYLON.Vector3(0, 9, 0),
    supportPosition: BABYLON.Vector3.Zero(),
    supportOrientation: BABYLON.Quaternion.Identity(),
    expectedVerticalOffset: 0.54,
    supportVerticalSpeed: 0.85,
  });
  assert.ok(lifting.y <= 1.05);
  assert.ok(lifting.y >= 0.85);
});

test("descending forks do not pull supported cargo downward", () => {
  const stationary = constrainedForkVerticalVelocity({
    cargoPosition: new BABYLON.Vector3(0, 0.54, 0),
    cargoVelocity: BABYLON.Vector3.Zero(),
    supportPosition: BABYLON.Vector3.Zero(),
    supportOrientation: BABYLON.Quaternion.Identity(),
    expectedVerticalOffset: 0.54,
    supportVerticalSpeed: -0.85,
  });
  assert.equal(stationary.y, 0);

  const falling = constrainedForkVerticalVelocity({
    cargoPosition: new BABYLON.Vector3(0, 0.54, 0),
    cargoVelocity: new BABYLON.Vector3(0, -0.4, 0),
    supportPosition: BABYLON.Vector3.Zero(),
    supportOrientation: BABYLON.Quaternion.Identity(),
    expectedVerticalOffset: 0.54,
    supportVerticalSpeed: -0.85,
  });
  assert.equal(falling.y, -0.4);
});

test("only an upward-bearing contact beneath cargo transfers its load", () => {
  const cargoPosition = new BABYLON.Vector3(0, 1, 0);
  const cargoOrientation = BABYLON.Quaternion.Identity();
  assert.equal(cargoContactSupportsFromBelow({
    cargoPosition,
    cargoOrientation,
    contactPoint: new BABYLON.Vector3(0, 0.5, 0),
    contactNormal: BABYLON.Vector3.Down(),
  }), true);
  assert.equal(cargoContactSupportsFromBelow({
    cargoPosition,
    cargoOrientation,
    contactPoint: new BABYLON.Vector3(0.5, 1, 0),
    contactNormal: BABYLON.Axis.X,
  }), false);
  assert.equal(cargoContactSupportsFromBelow({
    cargoPosition,
    cargoOrientation,
    contactPoint: new BABYLON.Vector3(0, 1.5, 0),
    contactNormal: BABYLON.Vector3.Down(),
  }), false);
});

test("supported cargo grips the tines during normal vehicle travel", () => {
  const velocity = constrainedForkLongitudinalVelocity({
    cargoVelocity: BABYLON.Vector3.Zero(),
    supportVelocity: new BABYLON.Vector3(0, 0, -1),
    supportOrientation: BABYLON.Quaternion.Identity(),
    deltaSeconds: 0.05,
  });
  assert.equal(velocity.z, -0.8);

  const matched = constrainedForkLongitudinalVelocity({
    cargoVelocity: new BABYLON.Vector3(0, 0, -1),
    supportVelocity: new BABYLON.Vector3(0, 0, -1),
    supportOrientation: BABYLON.Quaternion.Identity(),
    deltaSeconds: 0.05,
  });
  assert.equal(matched.z, -1);
});

test("cargo ownership uses the agreed half-second contact grace", () => {
  assert.equal(CARGO_CONTACT_RELEASE_SECONDS, 0.5);
});

test("cargo auto-right tolerates a mostly downward bottom face", () => {
  assert.equal(CARGO_AUTO_RIGHT_SECONDS, 2);
  assert.equal(cargoBottomFacesDown(
    BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, Math.PI / 6),
  ), true);
  assert.equal(cargoBottomFacesDown(
    BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, Math.PI / 3),
  ), false);
  assert.equal(cargoBottomFacesDown(
    BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, Math.PI),
  ), false);
});

test("forklift cargo contact uses oriented boxes rather than broad spheres", () => {
  const cargo = {
    position: BABYLON.Vector3.Zero(),
    orientation: BABYLON.Quaternion.Identity(),
    halfExtents: new BABYLON.Vector3(0.5, 0.5, 0.5),
  };
  const touchingTine = {
    position: new BABYLON.Vector3(0, -0.45, 0.7),
    orientation: BABYLON.Quaternion.RotationAxis(
      BABYLON.Axis.Y,
      Math.PI / 4,
    ),
    halfExtents: new BABYLON.Vector3(0.06, 0.0275, 0.545),
  };
  const nearbyButSeparateTine = {
    ...touchingTine,
    position: new BABYLON.Vector3(1.2, -0.45, 0.7),
  };
  assert.equal(orientedBoxesIntersect(cargo, touchingTine), true);
  assert.equal(orientedBoxesIntersect(cargo, nearbyButSeparateTine), false);
});
