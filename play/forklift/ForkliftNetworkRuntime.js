import * as BABYLON from "@babylonjs/core";
import {
  advanceForkliftState,
  createForkliftState,
} from "../../src/ForkliftRig.js";
import {
  advanceForkliftChassis,
  createForkliftChassisState,
} from "../../src/ForkliftChassisDynamics.js";
import {
  interpolationAlpha,
  shortestAngleDelta,
} from "../../src/multiplayer/interpolation.js";

export class ForkliftNetworkRuntime {
  constructor({
    fleetRuntime,
    idPattern,
    getRemotePlayers,
    getClient,
    getWorldId,
    isLocallyDriving,
    getActiveId,
    setParked,
    orientationQuaternion,
    modelOrientationQuaternion,
    quaternionFromNetworkState,
    exitLocalForklift,
    onLocalOwnershipLost = () => {},
  }) {
    this.fleetRuntime = fleetRuntime;
    this.fleet = fleetRuntime.entries;
    this.idPattern = idPattern;
    this.getRemotePlayers = getRemotePlayers;
    this.getClient = getClient;
    this.getWorldId = getWorldId;
    this.isLocallyDriving = isLocallyDriving;
    this.getActiveId = getActiveId;
    this.setParked = setParked;
    this.orientationQuaternion = orientationQuaternion;
    this.modelOrientationQuaternion = modelOrientationQuaternion;
    this.quaternionFromNetworkState = quaternionFromNetworkState;
    this.exitLocalForklift = exitLocalForklift;
    this.onLocalOwnershipLost = onLocalOwnershipLost;
  }

  occupiedIds() {
    return new Set(
      [...(this.getRemotePlayers()?.players?.values() || [])]
        .map((player) => player.state?.vehicleId)
        .filter((id) => this.idPattern.test(id)),
    );
  }

  availableForLocalEntry(entry) {
    if (!entry) return false;
    const client = this.getClient();
    const selfId = client?.identity?.id || "";
    if (entry.networkOwnerId && entry.networkOwnerId !== selfId) return false;
    if (this.occupiedIds().has(entry.id)) return false;
    return Boolean(
      client?.connected
      && this.fleetRuntime.snapshotWorldId === this.getWorldId()
    );
  }

  syncVisibility() {
    const occupied = this.occupiedIds();
    for (const entry of this.fleet.values()) {
      const locallyDriven = (
        this.isLocallyDriving() && entry.id === this.getActiveId()
      );
      if (occupied.has(entry.id)) entry.coasting = false;
      entry.root.setEnabled(locallyDriven || !occupied.has(entry.id));
    }
  }

  syncRemoteCollisionPoses() {
    const poses = this.getRemotePlayers()?.occupiedVehiclePoses() || [];
    for (const pose of poses) {
      if (
        !this.idPattern.test(pose.vehicleId)
        || pose.vehicleId === this.getActiveId()
      ) {
        continue;
      }
      const entry = this.fleet.get(pose.vehicleId);
      if (!entry) continue;
      const networkOrientation = this.quaternionFromNetworkState(
        pose.state,
        pose.yaw,
        "vehicle",
      );
      const networkEuler = networkOrientation.toEulerAngles();
      const interpolatedOrientation = BABYLON.Quaternion.RotationYawPitchRoll(
        pose.yaw,
        networkEuler.x,
        networkEuler.z,
      ).normalize();
      entry.root.parent = null;
      entry.root.position.copyFrom(pose.position);
      entry.root.rotation.setAll(0);
      entry.root.rotationQuaternion = interpolatedOrientation.multiply(
        BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI),
      );
      entry.root.computeWorldMatrix(true);
      entry.yaw = pose.yaw;
      entry.state = createForkliftState({
        lift: Number(pose.state.vehicleLift) || 0,
        steeringAngle: Number(pose.state.vehicleSteering) || 0,
        wheelRoll: Number(pose.state.vehicleWheelRoll) || 0,
      });
      entry.networkOwnerId = pose.playerId;
      entry.rig.apply(entry.state);
    }
  }

  audioSnapshots() {
    const snapshots = [];
    for (const pose of this.getRemotePlayers()?.occupiedVehiclePoses() || []) {
      if (
        !this.idPattern.test(pose.vehicleId)
        || pose.vehicleId === this.getActiveId()
      ) {
        continue;
      }
      const entry = this.fleet.get(pose.vehicleId);
      if (!entry) continue;
      const orientation = this.quaternionFromNetworkState(
        pose.state,
        pose.yaw,
        "vehicle",
      );
      const rotation = BABYLON.Matrix.FromQuaternionToRef(
        orientation,
        BABYLON.Matrix.Identity(),
      );
      const forward = BABYLON.Vector3.TransformNormal(
        BABYLON.Axis.Z,
        rotation,
      );
      const up = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, rotation);
      snapshots.push({
        id: pose.vehicleId,
        position: pose.position,
        signedSpeed: BABYLON.Vector3.Dot(
          entry.networkTarget?.linearVelocity || BABYLON.Vector3.Zero(),
          forward,
        ),
        lift: Number(pose.state.vehicleLift) || 0,
        tiltAngle: Math.acos(BABYLON.Scalar.Clamp(up.y, -1, 1)),
      });
    }
    return snapshots;
  }

  static setVisibility(entry, visibility) {
    for (const node of [entry.root, ...entry.root.getDescendants(false)]) {
      if ("visibility" in node) node.visibility = visibility;
    }
  }

  targetFromServer(state) {
    const abandoned = !state.ownerId && Number(state.expiresAtMs) > 0;
    return {
      position: new BABYLON.Vector3(
        Number(state.x) || 0,
        Number(state.y) || 0,
        Number(state.z) || 0,
      ),
      yaw: Number(state.yaw) || 0,
      orientation: this.quaternionFromNetworkState(
        state,
        Number(state.yaw) || 0,
      ),
      state: createForkliftState({
        lift: Number(state.lift) || 0,
        steeringAngle: Number(state.steering) || 0,
        wheelRoll: Number(state.wheelRoll) || 0,
      }),
      linearVelocity: new BABYLON.Vector3(
        abandoned ? 0 : Number(state.velocityX) || 0,
        abandoned ? 0 : Number(state.velocityY) || 0,
        abandoned ? 0 : Number(state.velocityZ) || 0,
      ),
      angularVelocity: new BABYLON.Vector3(
        abandoned ? 0 : Number(state.angularVelocityX) || 0,
        abandoned ? 0 : Number(state.angularVelocityY) || 0,
        abandoned ? 0 : Number(state.angularVelocityZ) || 0,
      ),
    };
  }

  snapToTarget(entry, target) {
    entry.righting = null;
    entry.root.parent = null;
    entry.root.position.copyFrom(target.position);
    entry.root.rotation.setAll(0);
    entry.root.rotationQuaternion = target.orientation.multiply(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI),
    );
    entry.yaw = target.yaw;
    const euler = target.orientation.toEulerAngles();
    const tippedForward = Math.abs(euler.x) > 1;
    const tippedSideways = Math.abs(euler.z) > 1.2;
    entry.chassisState = createForkliftChassisState({
      pitch: euler.x,
      roll: euler.z,
      tipped: tippedForward || tippedSideways,
      tippingDirection: tippedSideways ? Math.sign(euler.z) : 0,
      pitchTippingDirection: tippedForward ? Math.sign(euler.x) : 0,
    });
    entry.state = createForkliftState(target.state);
    entry.physicsLinearVelocity.copyFrom(target.linearVelocity);
    entry.physicsAngularVelocity.copyFrom(target.angularVelocity);
    entry.rig.apply(entry.state);
  }

  applyServerState(state) {
    if (
      state?.worldId !== this.getWorldId()
      || !this.fleetRuntime.acceptServerState(state)
    ) return;
    const entry = this.fleet.get(state?.id);
    if (!entry) {
      void this.fleetRuntime.ensureServerEntry(state).then((loadedEntry) => {
        if (loadedEntry) this.applyServerState(state);
      }).catch((error) => {
        console.warn("[Multiplayer] spawned forklift failed to load", error);
      });
      return;
    }
    const selfId = this.getClient()?.identity?.id;
    entry.collisionDisabledUntilMs = Math.max(
      Number(entry.collisionDisabledUntilMs) || 0,
      Number(state.rightingUntilMs) || 0,
    );
    if (
      this.isLocallyDriving()
      && entry.id === this.getActiveId()
      && (!state.ownerId || state.ownerId === selfId)
    ) return;
    if (entry.coasting && !state.ownerId) return;
    entry.fadeRemaining = 0;
    ForkliftNetworkRuntime.setVisibility(entry, 1);
    const target = this.targetFromServer(state);
    const firstNetworkPose = entry.networkTarget === null;
    const ownershipChanged = entry.networkOwnerId !== (state.ownerId || "");
    entry.networkOwnerId = state.ownerId || "";
    entry.networkTarget = target;
    if (state.ownerId) {
      entry.coasting = false;
      this.snapToTarget(entry, target);
      entry.root.setEnabled(state.ownerId === selfId);
      return;
    }
    if (firstNetworkPose || ownershipChanged || !entry.root.isEnabled()) {
      this.snapToTarget(entry, target);
    }
    entry.root.setEnabled(true);
    this.setParked(entry, true);
  }

  removeServerForklift(id) {
    this.fleetRuntime.removeServerId(id);
    const entry = this.fleet.get(id);
    if (
      !entry
      || (this.isLocallyDriving() && id === this.getActiveId())
    ) return;
    entry.coasting = false;
    entry.fadeRemaining = 1;
    this.setParked(entry, false);
  }

  replaceServerSnapshot(states) {
    const acceptedStates = this.fleetRuntime.replaceServerSnapshot(states);
    for (const state of acceptedStates) this.applyServerState(state);
  }

  clearServerSnapshot() {
    this.fleetRuntime.clearServerSnapshot();
  }

  simulate(deltaSeconds) {
    for (const entry of this.fleet.values()) {
      if (entry.fadeRemaining > 0 || entry.righting) continue;
      this.#updateCoasting(entry, deltaSeconds);
    }
  }

  updatePresentation(deltaSeconds) {
    for (const entry of this.fleet.values()) {
      if (this.#updateFade(entry, deltaSeconds)) continue;
      if (this.#updateRighting(entry, deltaSeconds)) continue;
      this.#interpolateNetworkTarget(entry, deltaSeconds);
    }
  }

  update(deltaSeconds, animationDeltaSeconds = deltaSeconds) {
    this.simulate(deltaSeconds);
    this.updatePresentation(animationDeltaSeconds);
  }

  #updateFade(entry, animationDeltaSeconds) {
    if (entry.fadeRemaining <= 0) return false;
    entry.fadeRemaining = Math.max(
      0,
      entry.fadeRemaining - Math.max(0, animationDeltaSeconds),
    );
    ForkliftNetworkRuntime.setVisibility(entry, entry.fadeRemaining);
    if (entry.fadeRemaining === 0) entry.root.setEnabled(false);
    return true;
  }

  #updateRighting(entry, animationDeltaSeconds) {
    if (!entry.righting) return false;
    const animation = entry.righting;
    animation.elapsedSeconds = Math.min(
      animation.durationSeconds,
      animation.elapsedSeconds + Math.max(0, animationDeltaSeconds),
    );
    const progress = animation.durationSeconds > 0
      ? animation.elapsedSeconds / animation.durationSeconds
      : 1;
    const easedProgress = 1 - (1 - progress) ** 3;
    BABYLON.Vector3.LerpToRef(
      animation.startPosition,
      animation.targetPosition,
      easedProgress,
      entry.root.position,
    );
    entry.root.rotationQuaternion = BABYLON.Quaternion.Slerp(
      animation.startOrientation,
      animation.targetOrientation,
      easedProgress,
    ).normalize();
    entry.root.rotation.setAll(0);
    entry.state = createForkliftState({
      lift: animation.startState.lift + (
        animation.targetState.lift - animation.startState.lift
      ) * easedProgress,
      steeringAngle: animation.startState.steeringAngle + (
        animation.targetState.steeringAngle
        - animation.startState.steeringAngle
      ) * easedProgress,
      wheelRoll: animation.startState.wheelRoll + (
        animation.targetState.wheelRoll - animation.startState.wheelRoll
      ) * easedProgress,
    });
    entry.rig.apply(entry.state);
    if (progress >= 1) {
      entry.root.position.copyFrom(animation.targetPosition);
      entry.root.rotationQuaternion.copyFrom(animation.targetOrientation);
      entry.state = animation.targetState;
      entry.chassisState = animation.targetChassisState;
      entry.rig.apply(entry.state);
      entry.righting = null;
    }
    return true;
  }

  #interpolateNetworkTarget(entry, deltaSeconds) {
    if (
      !entry.networkTarget
      || entry.networkOwnerId
      || entry.coasting
      || entry.id === this.getActiveId()
    ) return;
    const alpha = interpolationAlpha(deltaSeconds);
    BABYLON.Vector3.LerpToRef(
      entry.root.position,
      entry.networkTarget.position,
      alpha,
      entry.root.position,
    );
    entry.yaw += shortestAngleDelta(
      entry.yaw,
      entry.networkTarget.yaw,
    ) * alpha;
    const currentOrientation = entry.root.rotationQuaternion
      || this.modelOrientationQuaternion(entry.yaw, entry.chassisState);
    const targetModelOrientation = entry.networkTarget.orientation.multiply(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI),
    );
    entry.root.rotationQuaternion = BABYLON.Quaternion.Slerp(
      currentOrientation,
      targetModelOrientation,
      alpha,
    ).normalize();
    entry.root.rotation.setAll(0);
    entry.state = createForkliftState({
      lift: entry.state.lift + (
        entry.networkTarget.state.lift - entry.state.lift
      ) * alpha,
      steeringAngle: entry.state.steeringAngle + (
        entry.networkTarget.state.steeringAngle
        - entry.state.steeringAngle
      ) * alpha,
      wheelRoll: entry.state.wheelRoll + (
        entry.networkTarget.state.wheelRoll - entry.state.wheelRoll
      ) * alpha,
    });
    entry.rig.apply(entry.state);
  }

  #updateCoasting(entry, deltaSeconds) {
    if (!entry.coasting || entry.id === this.getActiveId()) return;
    const nextState = advanceForkliftState(
      entry.state,
      { throttle: 0, steering: 0, lift: 0 },
      deltaSeconds,
    );
    const actorYaw = entry.yaw + nextState.yawDelta;
    entry.yaw = actorYaw;
    entry.root.position.addInPlace(new BABYLON.Vector3(
      Math.sin(actorYaw) * nextState.distance,
      0,
      Math.cos(actorYaw) * nextState.distance,
    ));
    entry.state = nextState;
    entry.physicsLinearVelocity.set(
      Math.sin(actorYaw) * nextState.speed,
      0,
      Math.cos(actorYaw) * nextState.speed,
    );
    entry.physicsAngularVelocity.set(
      0,
      nextState.yawDelta / Math.max(1 / 240, deltaSeconds),
      0,
    );
    entry.chassisState = advanceForkliftChassis(
      entry.chassisState,
      nextState,
      deltaSeconds,
    );
    entry.root.rotationQuaternion = this.modelOrientationQuaternion(
      actorYaw,
      entry.chassisState,
    );
    entry.root.rotation.setAll(0);
    entry.rig.apply(nextState);
    entry.networkAccumulator += deltaSeconds;
    if (
      entry.networkAccumulator >= 0.1
      || Math.abs(nextState.speed) <= 0.03
    ) {
      entry.networkAccumulator = 0;
      const orientation = this.orientationQuaternion(
        actorYaw,
        entry.chassisState,
      );
      this.getClient()?.sendForkliftUpdate({
        id: entry.id,
        x: entry.root.position.x,
        y: entry.root.position.y,
        z: entry.root.position.z,
        yaw: actorYaw,
        qx: orientation.x,
        qy: orientation.y,
        qz: orientation.z,
        qw: orientation.w,
        lift: nextState.lift,
        steering: nextState.steeringAngle,
        wheelRoll: nextState.wheelRoll,
        velocityX: entry.physicsLinearVelocity.x,
        velocityY: entry.physicsLinearVelocity.y,
        velocityZ: entry.physicsLinearVelocity.z,
        angularVelocityX: entry.physicsAngularVelocity.x,
        angularVelocityY: entry.physicsAngularVelocity.y,
        angularVelocityZ: entry.physicsAngularVelocity.z,
      });
    }
    if (Math.abs(nextState.speed) <= 0.03) {
      entry.state = createForkliftState({ ...nextState, speed: 0 });
      entry.coasting = false;
    }
  }

  reconcileLocalOwnership() {
    if (!this.isLocallyDriving()) {
      this.syncVisibility();
      return;
    }
    if (!this.occupiedIds().has(this.getActiveId())) {
      this.syncVisibility();
      return;
    }
    const contestedId = this.getActiveId();
    this.exitLocalForklift();
    this.syncVisibility();
    this.onLocalOwnershipLost(contestedId);
  }
}
