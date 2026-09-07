import * as BABYLON from "@babylonjs/core";
import {
  createNameTag,
  nameTagHeightForNode,
} from "./NameTag.js";
import {
  interpolationAlpha,
  shortestAngleDelta,
  shouldSnapPosition,
} from "./interpolation.js";

function vectorForState(state) {
  return new BABYLON.Vector3(state.x, state.y, state.z);
}

const MAX_PREDICTION_SECONDS = 0.15;
const MAX_PREDICTED_SPEED = 20;

export class RemotePlayerManager {
  constructor(scene, {
    createAvatar,
    createTag = createNameTag,
    getTagHeight = nameTagHeightForNode,
    stopBlendSeconds = 0.2,
  }) {
    this.scene = scene;
    this.createAvatar = createAvatar;
    this.createTag = createTag;
    this.getTagHeight = getTagHeight;
    this.stopBlendSeconds = stopBlendSeconds;
    this.players = new Map();
  }

  replaceSnapshot(players) {
    const ids = new Set(players.map((player) => player.id));
    for (const id of this.players.keys()) {
      if (!ids.has(id)) this.remove(id);
    }
    for (const player of players) this.upsert(player);
  }

  upsert(state) {
    if (!state?.id || !Number.isFinite(state.sequence)) return;
    let player = this.players.get(state.id);
    if (player && state.sequence <= player.state.sequence) return;
    if (!player) {
      player = {
        state,
        targetPosition: vectorForState(state),
        targetYaw: state.yaw,
        motionVelocity: BABYLON.Vector3.Zero(),
        yawVelocity: 0,
        sampleAgeSeconds: 0,
        predictedPosition: vectorForState(state),
        positionSettle: null,
        avatar: null,
        nameTag: null,
        nameTagHeight: 1.9,
        loadGeneration: 0,
        disposed: false,
      };
      this.players.set(state.id, player);
      this.loadAvatar(player, state.avatarId || state.characterId);
      return;
    }
    const characterChanged = (
      (state.avatarId || state.characterId)
      !== (player.state.avatarId || player.state.characterId)
    );
    const enteredVehicle = (
      state.vehicleId
      && state.vehicleId !== player.state.vehicleId
    );
    const stoppedMoving = player.state.movement !== "idle"
      && state.movement === "idle";
    const sampleSeconds = (
      Number(state.updatedAt) - Number(player.state.updatedAt)
    ) / 1000;
    const dx = state.x - player.state.x;
    const dy = state.y - player.state.y;
    const dz = state.z - player.state.z;
    const sampleDistance = Math.hypot(dx, dy, dz);
    if (
      !enteredVehicle
      && state.movement !== "idle"
      && Number.isFinite(sampleSeconds)
      && sampleSeconds > 0
      && sampleSeconds <= 0.5
      && sampleDistance / sampleSeconds <= MAX_PREDICTED_SPEED
    ) {
      player.motionVelocity.copyFromFloats(
        dx / sampleSeconds,
        dy / sampleSeconds,
        dz / sampleSeconds,
      );
      player.yawVelocity = shortestAngleDelta(
        player.state.yaw,
        state.yaw,
      ) / sampleSeconds;
    } else {
      player.motionVelocity.setAll(0);
      player.yawVelocity = 0;
    }
    player.sampleAgeSeconds = 0;
    player.state = state;
    player.targetPosition.copyFromFloats(state.x, state.y, state.z);
    player.targetYaw = state.yaw;
    if (enteredVehicle && player.avatar) {
      // The forklift already exists at this authoritative pose. Attaching it
      // at the pedestrian's previous interpolated position made the whole
      // vehicle visibly slide and rotate into place during entry.
      player.avatar.root.position.copyFrom(player.targetPosition);
      player.avatar.root.rotation.y = player.targetYaw;
      player.positionSettle = null;
    } else if (stoppedMoving && player.avatar) {
      player.positionSettle = {
        from: player.avatar.root.position.clone(),
        elapsedSeconds: 0,
      };
    } else if (state.movement !== "idle") {
      player.positionSettle = null;
    }
    player.avatar?.syncState(state);
    if (characterChanged) {
      this.loadAvatar(player, state.avatarId || state.characterId);
    }
  }

  remove(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disposed = true;
    player.loadGeneration += 1;
    player.nameTag?.dispose();
    player.avatar?.dispose();
    this.players.delete(id);
  }

  clear() {
    for (const id of [...this.players.keys()]) this.remove(id);
  }

  update(deltaSeconds) {
    const alpha = interpolationAlpha(deltaSeconds);
    for (const player of this.players.values()) {
      const avatar = player.avatar;
      if (!avatar) continue;
      player.sampleAgeSeconds += Math.max(0, deltaSeconds);
      const predictionSeconds = player.state.movement !== "idle"
        ? Math.min(MAX_PREDICTION_SECONDS, player.sampleAgeSeconds)
        : 0;
      player.predictedPosition.copyFrom(player.targetPosition);
      player.predictedPosition.addInPlace(
        player.motionVelocity.scale(predictionSeconds),
      );
      if (shouldSnapPosition(avatar.root.position, player.targetPosition)) {
        avatar.root.position.copyFrom(player.targetPosition);
        player.positionSettle = null;
      } else if (player.positionSettle) {
        player.positionSettle.elapsedSeconds += Math.max(0, deltaSeconds);
        const amount = this.stopBlendSeconds > 0
          ? Math.min(
            1,
            player.positionSettle.elapsedSeconds / this.stopBlendSeconds,
          )
          : 1;
        BABYLON.Vector3.LerpToRef(
          player.positionSettle.from,
          player.targetPosition,
          amount,
          avatar.root.position,
        );
        if (amount >= 1) player.positionSettle = null;
      } else {
        BABYLON.Vector3.LerpToRef(
          avatar.root.position,
          player.predictedPosition,
          alpha,
          avatar.root.position,
        );
      }
      const predictedYaw = (
        player.targetYaw + player.yawVelocity * predictionSeconds
      );
      avatar.root.rotation.y += shortestAngleDelta(
        avatar.root.rotation.y,
        predictedYaw,
      ) * alpha;
      avatar.update(deltaSeconds);
      player.nameTag?.setPosition(
        avatar.root.position,
        player.nameTagHeight,
      );
    }
  }

  occupiedVehiclePoses() {
    const poses = [];
    for (const player of this.players.values()) {
      const vehicleId = player.state?.vehicleId;
      if (!vehicleId || !player.avatar) continue;
      poses.push({
        playerId: player.state.id,
        vehicleId,
        position: player.avatar.root.position.clone(),
        yaw: player.avatar.root.rotation.y,
        state: player.state,
      });
    }
    return poses;
  }

  dispose() {
    this.clear();
  }

  async loadAvatar(player, characterId) {
    const generation = ++player.loadGeneration;
    let avatar = null;
    try {
      avatar = await this.createAvatar(characterId, player.targetPosition);
    } catch (error) {
      console.warn("[Multiplayer] remote avatar failed to load", error);
      return;
    }
    if (
      player.disposed
      || generation !== player.loadGeneration
      || this.players.get(player.state.id) !== player
    ) {
      avatar?.dispose();
      return;
    }
    avatar.root.position.copyFrom(player.avatar?.root.position
      || player.targetPosition);
    avatar.root.rotation.y = player.avatar?.root.rotation.y
      ?? player.targetYaw;
    avatar.syncState(player.state);
    const previousAvatar = player.avatar;
    player.avatar = avatar;
    player.nameTagHeight = this.getTagHeight(avatar.root);
    if (!player.nameTag) {
      player.nameTag = this.createTag(this.scene, player.state.name);
    }
    player.nameTag.setPosition(avatar.root.position, player.nameTagHeight);
    previousAvatar?.dispose();
  }
}
