import * as BABYLON from "@babylonjs/core";
import {
  cloneForkliftPose,
  interpolateForkliftPose,
} from "../../src/ForkliftPresentation.js";
import {
  DEFAULT_FORKLIFT_OPTIONS,
  advanceForkliftState,
  createForkliftState,
} from "../../src/ForkliftRig.js";
import {
  advanceForkliftChassis,
  createForkliftChassisState,
  forkliftChassisCanDrive,
} from "../../src/ForkliftChassisDynamics.js";
import { FORKLIFT_RACE_GRID_SPAWNS } from "../config/forklifts.js";

const RACE_GRID_POSITION_TOLERANCE = 1.5;

// Owns forklift-mode coordination that spans fleet snapshots, race UI, and
// world travel. Driving physics and mounted presentation are moved into this
// same runtime in the next extraction step.
export class ForkliftModeRuntime {
  constructor({
    raceWorld,
    race,
    fleetRuntime,
    getWorld,
    isSwitchingWorld,
    getClient,
    availableForLocalEntry,
    applyServerState,
    network,
    setParked,
    pickWorldWithRay,
    physicsTuning,
    actorRoot,
    chassisPose,
    getCargo,
    getController,
    modelOffset,
    sounds,
    effects,
    syncMode,
    markPresenceDirty,
    vehicleController,
    publishPresence,
    persistLocation,
    gridSpawns = FORKLIFT_RACE_GRID_SPAWNS,
  }) {
    this.raceWorld = raceWorld;
    this.race = race;
    this.fleetRuntime = fleetRuntime;
    this.getWorld = getWorld;
    this.isSwitchingWorld = isSwitchingWorld;
    this.getClient = getClient;
    this.availableForLocalEntry = availableForLocalEntry;
    this.applyServerState = applyServerState;
    this.network = network;
    this.setParked = setParked;
    this.pickWorldWithRay = pickWorldWithRay;
    this.physicsTuning = physicsTuning;
    this.actorRoot = actorRoot;
    this.chassisPose = chassisPose;
    this.getCargo = getCargo;
    this.getController = getController;
    this.modelOffset = modelOffset;
    this.sounds = sounds;
    this.effects = effects;
    this.syncMode = syncMode;
    this.markPresenceDirty = markPresenceDirty;
    this.vehicleController = vehicleController;
    this.publishPresence = publishPresence;
    this.persistLocation = persistLocation;
    this.lastPhysicsMovement = null;
    this.rig = null;
    this.state = createForkliftState();
    this.chassisState = createForkliftChassisState();
    this.physicsOrientation = null;
    this.driving = false;
    this.activeId = null;
    this.runToggleBefore = null;
    this.physicsSnapshots = {
      id: null,
      previous: null,
      current: null,
    };
    this.gridSpawns = gridSpawns;
    this.clearRaceEntryRequest();
  }

  clearRaceEntryRequest() {
    this.raceEntryPending = false;
    this.raceStartPending = false;
    this.spawnPending = false;
    this.pendingSpawnId = null;
    this.pendingSpawnTarget = null;
  }

  leaveRaceWorld() {
    this.clearRaceEntryRequest();
  }

  clearPhysicsSnapshots() {
    this.physicsSnapshots = {
      id: null,
      previous: null,
      current: null,
    };
  }

  capturePhysicsPose() {
    const activeId = this.activeId;
    const pose = this.driving && activeId
      ? this.getCargo().physics?.dynamicForkliftPose(activeId)
      : null;
    if (!pose) {
      this.clearPhysicsSnapshots();
      return;
    }
    const current = cloneForkliftPose(pose);
    if (this.physicsSnapshots.id !== activeId) {
      this.physicsSnapshots = {
        id: activeId,
        previous: cloneForkliftPose(current),
        current,
      };
      return;
    }
    this.physicsSnapshots = {
      id: activeId,
      previous: this.physicsSnapshots.current || cloneForkliftPose(current),
      current,
    };
  }

  applyPresentation(fixedStepAlpha) {
    const activeId = this.activeId;
    if (
      !this.driving
      || this.physicsSnapshots.id !== activeId
      || !this.physicsSnapshots.current
    ) return;
    const pose = interpolateForkliftPose(
      this.physicsSnapshots.previous,
      this.physicsSnapshots.current,
      fixedStepAlpha,
    );
    const matrix = BABYLON.Matrix.FromQuaternionToRef(
      pose.orientation,
      BABYLON.Matrix.Identity(),
    );
    const forward = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, matrix);
    if (Math.hypot(forward.x, forward.z) > 1e-5) {
      this.actorRoot.rotation.y = Math.atan2(forward.x, forward.z);
    }
    this.actorRoot.position.copyFrom(pose.position);
    const presentationState = this.chassisStateFromPhysics(
      pose,
      this.chassisState,
    );
    this.chassisPose.position.y = 0;
    this.chassisPose.rotationQuaternion.copyFrom(
      BABYLON.Quaternion.RotationYawPitchRoll(
        0,
        presentationState.pitch,
        presentationState.roll,
      ),
    );
  }

  applyChassisPose() {
    const physicsDriven = Boolean(
      this.getCargo().physics?.hasDynamicForklift(this.activeId),
    );
    this.chassisPose.position.y = physicsDriven
      ? 0
      : this.chassisState.bounce
        + (this.rig?.groundLiftForPose(
          this.chassisState.pitch,
          this.chassisState.roll,
        ) || 0);
    this.chassisPose.rotationQuaternion.copyFrom(
      BABYLON.Quaternion.RotationYawPitchRoll(
        0,
        this.chassisState.pitch,
        this.chassisState.roll,
      ),
    );
  }

  orientationFor(yaw, chassisState = this.chassisState) {
    return this.vehicleController.orientationQuaternion(
      yaw,
      chassisState,
      this.chassisState,
      this.physicsOrientation,
    );
  }

  modelOrientationFor(yaw, chassisState) {
    return this.vehicleController.modelOrientationQuaternion(
      yaw,
      chassisState,
      this.chassisState,
      this.physicsOrientation,
    );
  }

  chassisStateFromPhysics(pose, previousState) {
    return this.vehicleController.chassisStateFromPhysicsPose(
      pose,
      previousState,
    );
  }

  ensureDynamicPhysics(carriedCargo) {
    const cargo = this.getCargo();
    const controller = this.getController();
    if (!cargo.physics || !this.activeId || controller?.noClip) return false;
    if (cargo.physics.hasDynamicForklift(this.activeId)) return true;
    const orientation = this.orientationFor(
      this.actorRoot.rotation.y,
      this.chassisState,
    );
    this.physicsOrientation = orientation.clone();
    const activeEntry = this.fleetRuntime.entries.get(this.activeId);
    cargo.physics.activateDynamicForklift(this.activeId, {
      position: controller.collider.position.clone(),
      orientation,
      linearVelocity: activeEntry?.physicsLinearVelocity?.lengthSquared() > 0
        ? activeEntry.physicsLinearVelocity.clone()
        : new BABYLON.Vector3(
          Math.sin(this.actorRoot.rotation.y) * this.state.speed,
          0,
          Math.cos(this.actorRoot.rotation.y) * this.state.speed,
        ),
      angularVelocity: activeEntry?.physicsAngularVelocity?.clone()
        || BABYLON.Vector3.Zero(),
      tuning: this.physicsTuning,
      forkLift: this.state.lift,
      carriedLoad: carriedCargo.offGround
        ? Math.min(1, carriedCargo.count)
        : 0,
      loadHeightFraction: (
        carriedCargo.lift / DEFAULT_FORKLIFT_OPTIONS.maximumLift
      ),
    });
    return true;
  }

  updatePhysicsDriven(deltaSeconds, controls, carriedCargo) {
    if (!this.ensureDynamicPhysics(carriedCargo)) return null;
    const controller = this.getController();
    const previousPosition = controller.collider.position.clone();
    const canDrive = forkliftChassisCanDrive(this.chassisState);
    const articulated = advanceForkliftState(
      this.state,
      canDrive
        ? controls
        : { throttle: 0, steering: 0, lift: controls.lift },
      deltaSeconds,
      this.physicsTuning,
    );
    const pose = this.getCargo().physics.stepDynamicForklift(
      this.activeId,
      {
        throttle: canDrive ? controls.throttle : 0,
        steeringAngle: articulated.steeringAngle,
        forkLift: articulated.lift,
        carriedLoad: carriedCargo.offGround
          ? Math.min(1, carriedCargo.count)
          : 0,
        loadHeightFraction: (
          carriedCargo.lift / DEFAULT_FORKLIFT_OPTIONS.maximumLift
        ),
        tuning: this.physicsTuning,
      },
      deltaSeconds,
    );
    if (!pose) return null;
    this.physicsOrientation = pose.orientation.clone();
    const matrix = BABYLON.Matrix.FromQuaternionToRef(
      pose.orientation,
      BABYLON.Matrix.Identity(),
    );
    const forward = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, matrix);
    if (Math.hypot(forward.x, forward.z) > 1e-5) {
      this.actorRoot.rotation.y = Math.atan2(forward.x, forward.z);
    }
    controller.collider.position.copyFrom(pose.position);
    this.actorRoot.position.copyFrom(pose.position);
    const actualDistance = Math.hypot(
      pose.position.x - previousPosition.x,
      pose.position.z - previousPosition.z,
    ) * Math.sign(pose.forwardSpeed || articulated.speed);
    this.state = createForkliftState({
      ...articulated,
      speed: pose.forwardSpeed,
      lift: Number.isFinite(pose.forkLift)
        ? pose.forkLift
        : articulated.lift,
      wheelRoll: this.state.wheelRoll
        - actualDistance / DEFAULT_FORKLIFT_OPTIONS.wheelRadius,
    });
    this.chassisState = this.chassisStateFromPhysics(
      pose,
      this.chassisState,
    );
    this.applyChassisPose();
    return { actualDistance, pose };
  }

  tineCollisionMesh(mesh) {
    return Boolean(
      mesh?.isEnabled()
      && mesh.isPickable
      && mesh.checkCollisions
      && mesh.metadata?.playerVehicle !== true
      && mesh.metadata?.controllerCollider !== true
      && mesh.metadata?.remotePlayer !== true
    );
  }

  constrainTineTravel(displacement) {
    const controller = this.getController();
    const distance = displacement.length();
    if (!this.rig || controller?.noClip || distance <= 1e-8) {
      return displacement;
    }
    const forward = new BABYLON.Vector3(
      Math.sin(this.actorRoot.rotation.y),
      0,
      Math.cos(this.actorRoot.rotation.y),
    );
    if (BABYLON.Vector3.Dot(displacement, forward) <= 0) return displacement;
    const direction = displacement.scale(1 / distance);
    const contactPadding = 0.025;
    let allowedDistance = distance;
    for (const origin of this.rig.tineTipWorldPositions(this.state)) {
      const hit = this.pickWorldWithRay(
        new BABYLON.Ray(origin, direction, distance + contactPadding),
        mesh => this.tineCollisionMesh(mesh),
      );
      if (!hit?.hit) continue;
      allowedDistance = Math.min(
        allowedDistance,
        Math.max(0, hit.distance - contactPadding),
      );
    }
    return direction.scale(allowedDistance);
  }

  finishFrame(deltaSeconds, actualDistance, movementForward = null, terrain = null) {
    return this.vehicleController.finishFrame({
      deltaSeconds,
      actorRoot: this.actorRoot,
      forkliftState: this.state,
      actualDistance,
      movementForward,
      terrain,
      updateCamera: false,
    });
  }

  update(deltaSeconds) {
    const controller = this.getController();
    const cargo = this.getCargo();
    const controls = this.vehicleController.readInput();
    const upDot = Math.cos(this.chassisState.pitch)
      * Math.cos(this.chassisState.roll);
    this.sounds.update(deltaSeconds, {
      speed: this.state.speed,
      throttle: controls.throttle,
      lift: controls.lift,
      liftPosition: this.state.lift,
      maximumLift: DEFAULT_FORKLIFT_OPTIONS.maximumLift,
      horn: controls.horn,
      tiltAngle: Math.acos(BABYLON.Scalar.Clamp(upDot, -1, 1)),
      groundImpactImpulse: cargo.physics
        ?.consumeDynamicForkliftGroundImpact(this.activeId) || 0,
      maximumForwardSpeed: DEFAULT_FORKLIFT_OPTIONS.maximumForwardSpeed,
      maximumReverseSpeed: DEFAULT_FORKLIFT_OPTIONS.maximumReverseSpeed,
    });
    const carriedCargo = cargo.physics?.activeForkliftLoad() || {
      count: 0,
      lift: 0,
      offGround: false,
    };
    const physicsMovement = this.updatePhysicsDriven(
      deltaSeconds,
      controls,
      carriedCargo,
    );
    if (physicsMovement) {
      this.lastPhysicsMovement = physicsMovement;
      if (this.chassisState.tipped) this.state.speed = 0;
      const activeEntry = this.fleetRuntime.entries.get(this.activeId);
      if (activeEntry) {
        activeEntry.state = this.state;
        activeEntry.chassisState = this.chassisState;
        activeEntry.yaw = this.actorRoot.rotation.y;
        const pose = cargo.physics.dynamicForkliftPose(this.activeId);
        if (pose) {
          activeEntry.physicsLinearVelocity.copyFrom(pose.linearVelocity);
          activeEntry.physicsAngularVelocity.copyFrom(pose.angularVelocity);
        }
      }
      this.rig.apply(this.state);
      return this.finishFrame(deltaSeconds, physicsMovement.actualDistance);
    }
    if (cargo.physics?.hasDynamicForklift(this.activeId)) {
      const pose = cargo.physics.deactivateDynamicForklift(this.activeId);
      const activeEntry = this.fleetRuntime.entries.get(this.activeId);
      if (pose && activeEntry) {
        activeEntry.physicsLinearVelocity.setAll(0);
        activeEntry.physicsAngularVelocity.setAll(0);
      }
      this.physicsOrientation = null;
    }
    this.lastPhysicsMovement = null;
    const previousState = this.state;
    const canDrive = forkliftChassisCanDrive(this.chassisState);
    const nextState = advanceForkliftState(
      previousState,
      canDrive
        ? controls
        : { throttle: 0, steering: 0, lift: controls.lift },
      deltaSeconds,
      this.physicsTuning,
    );
    const previousPosition = controller.collider.position.clone();
    this.actorRoot.rotation.y += nextState.yawDelta;
    const forward = new BABYLON.Vector3(
      Math.sin(this.actorRoot.rotation.y),
      0,
      Math.cos(this.actorRoot.rotation.y),
    );
    const requestedDisplacement = forward.scale(nextState.distance);
    const tineTravel = this.constrainTineTravel(requestedDisplacement);
    let terrain = Math.abs(nextState.distance) > 1e-8
      ? controller.moveHorizontal(tineTravel)
      : controller.snapToTerrain();
    const landing = controller.advanceVertical(deltaSeconds);
    if (landing) terrain = landing;
    this.actorRoot.position.copyFrom(controller.collider.position);
    const actualDistance = Math.hypot(
      controller.collider.position.x - previousPosition.x,
      controller.collider.position.z - previousPosition.z,
    ) * Math.sign(nextState.distance);
    this.state = {
      ...nextState,
      wheelRoll: previousState.wheelRoll
        - actualDistance / DEFAULT_FORKLIFT_OPTIONS.wheelRadius,
    };
    this.chassisState = advanceForkliftChassis(
      this.chassisState,
      {
        ...this.state,
        steeringInput: controls.steering,
        roadHeightDelta: controller.collider.position.y - previousPosition.y,
        carriedLoad: carriedCargo.offGround
          ? Math.min(1, carriedCargo.count)
          : 0,
        loadHeightFraction: carriedCargo.lift
          / DEFAULT_FORKLIFT_OPTIONS.maximumLift,
      },
      deltaSeconds,
    );
    if (this.chassisState.tipped) this.state.speed = 0;
    this.applyChassisPose();
    const activeEntry = this.fleetRuntime.entries.get(this.activeId);
    if (activeEntry) {
      activeEntry.state = this.state;
      activeEntry.chassisState = this.chassisState;
      activeEntry.yaw = this.actorRoot.rotation.y;
    }
    this.rig.apply(this.state);
    return this.finishFrame(deltaSeconds, actualDistance, forward, terrain);
  }

  enter(entry) {
    const controller = this.getController();
    if (
      !entry
      || entry.righting
      || this.driving
      || this.isSwitchingWorld()
      || !controller
      || !this.availableForLocalEntry(entry)
    ) return false;
    this.runToggleBefore = controller.runToggled;
    if (entry.networkTarget) {
      entry.physicsLinearVelocity.copyFrom(
        entry.networkTarget.linearVelocity || BABYLON.Vector3.Zero(),
      );
      entry.physicsAngularVelocity.copyFrom(
        entry.networkTarget.angularVelocity || BABYLON.Vector3.Zero(),
      );
    }
    const position = entry.root.getAbsolutePosition().clone();
    const yaw = Number.isFinite(entry.yaw)
      ? entry.yaw
      : entry.root.rotation.y - Math.PI;
    this.setParked(entry, false);
    controller.reset(position, yaw, { snapToTerrain: false });
    entry.root.parent = this.chassisPose;
    entry.root.position.setAll(0);
    entry.root.rotationQuaternion = null;
    entry.root.rotation.set(0, Math.PI, 0);
    this.modelOffset.parent = this.chassisPose;
    this.rig = entry.rig;
    this.state = entry.state;
    this.chassisState = entry.chassisState || createForkliftChassisState();
    this.physicsOrientation = null;
    this.applyChassisPose();
    entry.coasting = false;
    this.driving = true;
    this.activeId = entry.id;
    this.sounds.enter();
    entry.exhaustSmoke?.start();
    this.vehicleController.cameraManuallyPositioned = false;
    this.syncMode();
    this.network.syncVisibility();
    if (this.race.holdVehicleUntilStart()) {
      this.state = createForkliftState({
        ...this.state,
        speed: 0,
        steeringAngle: 0,
      });
      entry.state = this.state;
      entry.physicsLinearVelocity.setAll(0);
      entry.physicsAngularVelocity.setAll(0);
      this.rig.apply(this.state);
    }
    this.markPresenceDirty();
    return true;
  }

  exit() {
    const controller = this.getController();
    if (!this.driving || !this.rig || !controller) return false;
    this.race.vehicleExited();
    const entry = this.fleetRuntime.entries.get(this.activeId);
    if (!entry) return false;
    this.effects.endTireMarks();
    const physicsPose = this.getCargo().physics?.deactivateDynamicForklift(
      this.activeId,
    );
    const position = physicsPose?.position.clone()
      || this.actorRoot.position.clone();
    const vehiclePosition = physicsPose?.position.clone()
      || BABYLON.Vector3.Zero();
    const vehicleScaling = BABYLON.Vector3.One();
    const modelFacingCorrection = BABYLON.Quaternion.RotationAxis(
      BABYLON.Axis.Y,
      Math.PI,
    );
    const vehicleModelOrientation = physicsPose?.orientation
      ?.multiply(modelFacingCorrection)
      .normalize() || BABYLON.Quaternion.Identity();
    if (!physicsPose) {
      entry.root.computeWorldMatrix(true);
      entry.root.getWorldMatrix().decompose(
        vehicleScaling,
        vehicleModelOrientation,
        vehiclePosition,
      );
    }
    const vehicleForward = physicsPose
      ? BABYLON.Vector3.TransformNormal(
        BABYLON.Axis.Z,
        BABYLON.Matrix.FromQuaternionToRef(
          physicsPose.orientation,
          BABYLON.Matrix.Identity(),
        ),
      )
      : null;
    const yaw = vehicleForward
      && Math.hypot(vehicleForward.x, vehicleForward.z) > 1e-5
      ? Math.atan2(vehicleForward.x, vehicleForward.z)
      : this.actorRoot.rotation.y;
    const resettingRollover = this.chassisState.tipped
      || this.chassisState.tippingDirection !== 0
      || this.chassisState.pitchTippingDirection !== 0;
    const parkedState = resettingRollover
      ? createForkliftState({
        ...this.state,
        speed: 0,
        steeringAngle: 0,
      })
      : this.state;
    entry.state = parkedState;
    entry.chassisState = this.chassisState;
    entry.yaw = yaw;
    if (physicsPose) {
      entry.physicsLinearVelocity.copyFrom(physicsPose.linearVelocity);
      entry.physicsAngularVelocity.copyFrom(physicsPose.angularVelocity);
    }
    if (resettingRollover) {
      entry.physicsLinearVelocity.setAll(0);
      entry.physicsAngularVelocity.setAll(0);
    }
    entry.coasting = !resettingRollover
      && Math.abs(parkedState.speed) > 0.03;
    entry.root.parent = null;
    entry.root.position.copyFrom(vehiclePosition);
    entry.root.scaling.copyFrom(vehicleScaling);
    entry.root.rotation.setAll(0);
    entry.root.rotationQuaternion = vehicleModelOrientation.normalize();
    entry.root.computeWorldMatrix(true);
    entry.rig.apply(parkedState);
    this.setParked(entry, true);
    const orientation = vehicleModelOrientation.multiply(
      modelFacingCorrection.conjugate(),
    ).normalize();
    entry.networkOwnerId = "";
    entry.righting = null;
    entry.exhaustSmoke?.stop();
    entry.networkTarget = {
      position: vehiclePosition.clone(),
      yaw,
      orientation: orientation.clone(),
      state: createForkliftState(parkedState),
    };
    this.getClient()?.sendForkliftUpdate({
      id: entry.id,
      x: vehiclePosition.x,
      y: vehiclePosition.y,
      z: vehiclePosition.z,
      yaw,
      qx: orientation.x,
      qy: orientation.y,
      qz: orientation.z,
      qw: orientation.w,
      lift: parkedState.lift,
      steering: parkedState.steeringAngle,
      wheelRoll: parkedState.wheelRoll,
      velocityX: entry.physicsLinearVelocity.x,
      velocityY: entry.physicsLinearVelocity.y,
      velocityZ: entry.physicsLinearVelocity.z,
      angularVelocityX: entry.physicsAngularVelocity.x,
      angularVelocityY: entry.physicsAngularVelocity.y,
      angularVelocityZ: entry.physicsAngularVelocity.z,
    }, { release: true });
    const right = new BABYLON.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.rig = null;
    this.state = createForkliftState();
    this.chassisState = createForkliftChassisState();
    this.physicsOrientation = null;
    this.driving = false;
    this.activeId = null;
    this.clearPhysicsSnapshots();
    this.sounds.exit();
    this.vehicleController.cameraManuallyPositioned = false;
    this.modelOffset.parent = this.actorRoot;
    this.chassisPose.position.setAll(0);
    this.chassisPose.rotationQuaternion.copyFrom(
      BABYLON.Quaternion.Identity(),
    );
    controller.reset(position.add(right.scale(1.35)), yaw);
    if (this.runToggleBefore !== null) {
      controller.runToggled = this.runToggleBefore;
    }
    this.runToggleBefore = null;
    this.syncMode();
    this.network.syncVisibility();
    this.markPresenceDirty();
    return true;
  }

  disposeWorld() {
    this.sounds.exit();
    this.fleetRuntime.dispose();
    this.rig = null;
    this.state = createForkliftState();
    this.chassisState = createForkliftChassisState();
    this.physicsOrientation = null;
    this.driving = false;
    this.activeId = null;
    this.clearPhysicsSnapshots();
    this.vehicleController.cameraManuallyPositioned = false;
    this.runToggleBefore = null;
    this.modelOffset.parent = this.actorRoot;
    this.chassisPose.position.setAll(0);
    this.chassisPose.rotationQuaternion.copyFrom(
      BABYLON.Quaternion.Identity(),
    );
  }

  resetMountedAt(position, yaw) {
    const controller = this.getController();
    if (!this.driving || !this.rig || !controller) return false;
    this.getCargo().physics?.deactivateDynamicForklift(this.activeId);
    this.physicsOrientation = null;
    this.clearPhysicsSnapshots();
    this.state = createForkliftState();
    this.chassisState = createForkliftChassisState();
    controller.reset(position, yaw);
    this.applyChassisPose();
    this.rig.apply(this.state);
    const activeEntry = this.fleetRuntime.entries.get(this.activeId);
    if (activeEntry) {
      activeEntry.state = this.state;
      activeEntry.chassisState = this.chassisState;
      activeEntry.yaw = yaw;
    }
    return true;
  }

  requestRaceEntry({ startRace = false } = {}) {
    this.raceEntryPending = true;
    this.raceStartPending = Boolean(startRace);
  }

  onLocalOwnershipLost() {
    if (
      this.getWorld() !== this.raceWorld
      || this.isSwitchingWorld()
    ) return;
    const shouldRestartRace = this.race.session.status !== "inactive";
    if (shouldRestartRace) this.race.abort();
    this.requestRaceEntry({ startRace: shouldRestartRace });
    queueMicrotask(() => this.tryEnterPendingRaceForklift());
  }

  raceGridEntryAtSpawn(spawn) {
    const entry = this.fleetRuntime.entries.get(spawn.id);
    if (!entry || !this.availableForLocalEntry(entry)) return null;
    const position = entry.root.getAbsolutePosition();
    return Math.hypot(
      position.x - spawn.position.x,
      position.z - spawn.position.z,
    ) <= RACE_GRID_POSITION_TOLERANCE
      ? entry
      : null;
  }

  availableRaceGridEntry() {
    for (const spawn of this.gridSpawns) {
      const entry = this.raceGridEntryAtSpawn(spawn);
      if (entry) return entry;
    }
    const spawnedEntry = this.fleetRuntime.entries.get(this.pendingSpawnId);
    return this.availableForLocalEntry(spawnedEntry) ? spawnedEntry : null;
  }

  placeParkedForRace(entry, position, yaw) {
    if (!entry) return false;
    const parkedState = createForkliftState();
    const parkedChassisState = createForkliftChassisState();
    const orientation = this.orientationFor(yaw, parkedChassisState);
    entry.coasting = false;
    entry.righting = null;
    entry.networkOwnerId = "";
    entry.state = parkedState;
    entry.chassisState = parkedChassisState;
    entry.yaw = yaw;
    entry.physicsLinearVelocity.setAll(0);
    entry.physicsAngularVelocity.setAll(0);
    entry.root.parent = null;
    entry.root.position.copyFrom(position);
    entry.root.rotation.setAll(0);
    entry.root.rotationQuaternion = orientation.multiply(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI),
    );
    entry.networkTarget = {
      position: position.clone(),
      yaw,
      orientation: orientation.clone(),
      state: createForkliftState(parkedState),
      linearVelocity: BABYLON.Vector3.Zero(),
      angularVelocity: BABYLON.Vector3.Zero(),
    };
    entry.rig.apply(parkedState);
    this.setParked(entry, true);
    this.getClient()?.sendForkliftUpdate({
      id: entry.id,
      x: position.x,
      y: position.y,
      z: position.z,
      yaw,
      qx: orientation.x,
      qy: orientation.y,
      qz: orientation.z,
      qw: orientation.w,
      lift: 0,
      steering: 0,
      wheelRoll: 0,
    });
    return true;
  }

  raceStartSpawnOccupied(spawn, excludedForkliftId = null) {
    const occupiedIds = this.network.occupiedIds();
    for (const entry of this.fleetRuntime.entries.values()) {
      if (entry.id === excludedForkliftId) continue;
      if (!entry.networkOwnerId && !occupiedIds.has(entry.id)) continue;
      const position = entry.root.getAbsolutePosition();
      if (Math.hypot(
        position.x - spawn.position.x,
        position.z - spawn.position.z,
      ) <= 2.25) return true;
    }
    return false;
  }

  availableRaceStartSpawn(excludedForkliftId = null) {
    return this.gridSpawns.find(spawn => (
      !this.raceStartSpawnOccupied(spawn, excludedForkliftId)
    )) || null;
  }

  clearRaceSpawn(spawn) {
    if (!spawn) return;
    const left = new BABYLON.Vector3(
      -Math.cos(spawn.yaw),
      0,
      Math.sin(spawn.yaw),
    );
    let leftOffset = 3.5;
    for (const entry of this.fleetRuntime.entries.values()) {
      if (
        entry.id === this.activeId
        || !this.availableForLocalEntry(entry)
      ) continue;
      const position = entry.root.getAbsolutePosition();
      if (Math.hypot(
        position.x - spawn.position.x,
        position.z - spawn.position.z,
      ) > 2.25) continue;
      this.placeParkedForRace(
        entry,
        spawn.position.add(left.scale(leftOffset)),
        spawn.yaw,
      );
      leftOffset += 3.5;
    }
  }

  resetForRaceStart() {
    const controller = this.getController();
    if (
      this.getWorld() !== this.raceWorld
      || !this.driving
      || !this.rig
      || !controller
    ) return false;
    const entry = this.fleetRuntime.entries.get(this.activeId);
    if (!entry) return false;
    const startSpawn = this.availableRaceStartSpawn(this.activeId);
    if (!startSpawn) return false;
    this.clearRaceSpawn(startSpawn);
    this.getCargo().physics?.deactivateDynamicForklift(this.activeId);
    this.effects.endTireMarks();
    this.physicsOrientation = null;
    this.clearPhysicsSnapshots();
    this.state = createForkliftState();
    this.chassisState = createForkliftChassisState();
    controller.reset(
      startSpawn.position,
      startSpawn.yaw,
      { snapToTerrain: false },
    );
    this.applyChassisPose();
    this.rig.apply(this.state);
    entry.state = this.state;
    entry.chassisState = this.chassisState;
    entry.yaw = startSpawn.yaw;
    entry.coasting = false;
    entry.righting = null;
    entry.physicsLinearVelocity.setAll(0);
    entry.physicsAngularVelocity.setAll(0);
    const orientation = this.orientationFor(startSpawn.yaw);
    entry.networkTarget = {
      position: startSpawn.position.clone(),
      yaw: startSpawn.yaw,
      orientation: orientation.clone(),
      state: createForkliftState(this.state),
      linearVelocity: BABYLON.Vector3.Zero(),
      angularVelocity: BABYLON.Vector3.Zero(),
    };
    // Presence claims ownership before the staged update; WebSocket ordering
    // makes the following vehicle pose authoritative for this player.
    this.markPresenceDirty();
    this.publishPresence(true);
    this.getClient()?.sendForkliftUpdate({
      id: entry.id,
      x: startSpawn.position.x,
      y: startSpawn.position.y,
      z: startSpawn.position.z,
      yaw: startSpawn.yaw,
      qx: orientation.x,
      qy: orientation.y,
      qz: orientation.z,
      qw: orientation.w,
      lift: 0,
      steering: 0,
      wheelRoll: 0,
    });
    this.persistLocation();
    return true;
  }

  needsRighting(entry) {
    return Boolean(entry && (
      entry.chassisState?.tipped
      || (entry.chassisState?.tippingDirection || 0) !== 0
      || Math.abs(entry.chassisState?.roll || 0) > 0.05
      || Math.abs(entry.chassisState?.pitch || 0) > 0.05
    ));
  }

  groundedRightingPosition(entry) {
    const position = entry.root.getAbsolutePosition().clone();
    const poseLift = entry.rig.groundLiftForPose(
      entry.chassisState.pitch,
      entry.chassisState.roll,
    );
    const estimatedGroundY = position.y - poseLift;
    // Begin close to the expected contact plane so an indoor ceiling cannot
    // be mistaken for the floor while still recovering buried chassis.
    const rayOriginY = Math.max(position.y, estimatedGroundY) + 1.25;
    const terrainHit = this.pickWorldWithRay(
      new BABYLON.Ray(
        new BABYLON.Vector3(position.x, rayOriginY, position.z),
        BABYLON.Vector3.Down(),
        6,
      ),
      mesh => (
        mesh.isEnabled()
        && mesh.metadata?.terrain === true
        && mesh.metadata?.playerVehicle !== true
      ),
    );
    const groundY = terrainHit?.pickedPoint?.y ?? estimatedGroundY;
    const neutralMinimumY = Number(entry.rig.chassisBounds?.minimum?.y);
    position.y = groundY
      - (Number.isFinite(neutralMinimumY) ? neutralMinimumY : 0)
      + 0.025;
    return position;
  }

  rightParked(entry) {
    if (
      !entry
      || !this.availableForLocalEntry(entry)
      || !this.needsRighting(entry)
    ) return false;
    if (entry.righting) return true;
    const position = this.groundedRightingPosition(entry);
    const parkedState = createForkliftState({
      ...entry.state,
      speed: 0,
      steeringAngle: 0,
      lift: 0,
    });
    const parkedChassisState = createForkliftChassisState();
    const orientation = this.orientationFor(
      entry.yaw,
      parkedChassisState,
    );
    entry.coasting = false;
    const targetModelOrientation = orientation.multiply(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI),
    );
    const startModelOrientation = (
      entry.root.rotationQuaternion?.clone()
      || this.modelOrientationFor(entry.yaw, entry.chassisState)
    ).normalize();
    entry.righting = {
      elapsedSeconds: 0,
      durationSeconds: 0.7,
      startPosition: entry.root.position.clone(),
      targetPosition: position.clone(),
      startOrientation: startModelOrientation,
      targetOrientation: targetModelOrientation.clone(),
      startState: createForkliftState(entry.state),
      targetState: parkedState,
      targetChassisState: parkedChassisState,
    };
    entry.networkTarget = {
      position: position.clone(),
      yaw: entry.yaw,
      orientation: orientation.clone(),
      state: createForkliftState(parkedState),
    };
    this.getClient()?.sendForkliftUpdate({
      id: entry.id,
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: entry.yaw,
      qx: orientation.x,
      qy: orientation.y,
      qz: orientation.z,
      qw: orientation.w,
      lift: parkedState.lift,
      steering: parkedState.steeringAngle,
      wheelRoll: parkedState.wheelRoll,
      righting: true,
    });
    return true;
  }

  requestRaceForkliftSpawn() {
    if (this.spawnPending) return true;
    const startSpawn = this.availableRaceStartSpawn();
    if (!startSpawn) return false;
    this.clearRaceSpawn(startSpawn);
    this.pendingSpawnTarget = startSpawn;
    this.spawnPending = Boolean(this.getClient()?.spawnForklift({
      x: startSpawn.position.x,
      y: startSpawn.position.y,
      z: startSpawn.position.z,
      yaw: startSpawn.yaw,
    }));
    if (!this.spawnPending) this.clearRaceEntryRequest();
    return this.spawnPending;
  }

  isPendingRaceSpawnState(state) {
    if (
      !this.spawnPending
      || this.getWorld() !== this.raceWorld
      || state?.worldId !== this.raceWorld.id
      || this.gridSpawns.some(spawn => spawn.id === state.id)
    ) return false;
    const targetPosition = this.pendingSpawnTarget?.position;
    if (!targetPosition) return false;
    return Math.hypot(
      Number(state.x) - targetPosition.x,
      Number(state.z) - targetPosition.z,
    ) <= 0.1;
  }

  tryEnterPendingRaceForklift() {
    if (!this.raceEntryPending) return false;
    if (this.getWorld() !== this.raceWorld || this.driving) {
      this.clearRaceEntryRequest();
      return false;
    }
    if (this.isSwitchingWorld()) return false;
    const client = this.getClient();
    const snapshotReady = client?.connected
      && this.fleetRuntime.snapshotWorldId === this.getWorld().id;
    if (!snapshotReady) return false;
    if (this.enter(this.availableRaceGridEntry())) {
      const startRace = this.raceStartPending;
      this.clearRaceEntryRequest();
      if (startRace && this.resetForRaceStart()) this.race.start();
      return true;
    }
    if (!this.requestRaceForkliftSpawn()) {
      this.raceEntryPending = false;
      this.raceStartPending = false;
    }
    return false;
  }

  onForkliftState(state) {
    const pendingSpawn = this.isPendingRaceSpawnState(state);
    if (pendingSpawn) this.pendingSpawnId = state.id;
    this.applyServerState(state);
    if (!pendingSpawn) return;
    void this.fleetRuntime.ensureServerEntry(state).then(entry => {
      if (!entry || this.pendingSpawnId !== state.id) return;
      this.applyServerState(state);
      this.spawnPending = false;
      this.tryEnterPendingRaceForklift();
    }).catch(error => {
      console.warn("[Forklift race] spawned forklift failed to load", error);
      this.clearRaceEntryRequest();
    });
  }
}
