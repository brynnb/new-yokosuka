import * as BABYLON from "@babylonjs/core";
import {
  FORK_CARGO_OFF_GROUND_LIFT,
  normalizedQuaternion,
} from "./ForkliftCargoRules.js";

export function applyCargoServerState({
  entry,
  state,
  localPlayerId,
  groundPosition = () => {},
}) {
  if (!entry || !state) return false;
  const becomesLocalOwner = Boolean(
    localPlayerId && state.ownerId === localPlayerId,
  );
  entry.ownerId = state.ownerId || "";
  entry.targetPosition.set(
    Number(state.x) || 0,
    Number(state.y) || 0,
    Number(state.z) || 0,
  );
  if (state.autoRight) groundPosition(entry, entry.targetPosition);
  entry.targetOrientation.copyFrom(normalizedQuaternion(state));
  entry.targetLinearVelocity.set(
    Number(state.velocityX) || 0,
    Number(state.velocityY) || 0,
    Number(state.velocityZ) || 0,
  );
  entry.targetAngularVelocity.set(
    Number(state.angularVelocityX) || 0,
    Number(state.angularVelocityY) || 0,
    Number(state.angularVelocityZ) || 0,
  );
  if (becomesLocalOwner && !entry.localOwner) {
    entry.localOwner = true;
    entry.releaseSent = false;
    entry.networkAccumulator = 0;
    entry.node.position.copyFrom(entry.targetPosition);
    entry.node.rotationQuaternion.copyFrom(entry.targetOrientation);
    entry.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    entry.aggregate.body.setLinearVelocity(entry.targetLinearVelocity);
    entry.aggregate.body.setAngularVelocity(entry.targetAngularVelocity);
  } else if (!becomesLocalOwner && entry.localOwner) {
    entry.localOwner = false;
    entry.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
  }
  return true;
}

export function revokeCargoLocalOwnership(entries) {
  for (const entry of entries) {
    if (!entry.localOwner) continue;
    entry.ownerId = "";
    entry.localOwner = false;
    entry.releaseSent = false;
    entry.targetPosition.copyFrom(entry.node.position);
    entry.targetOrientation.copyFrom(entry.node.rotationQuaternion);
    entry.targetLinearVelocity.setAll(0);
    entry.targetAngularVelocity.setAll(0);
    entry.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
    entry.aggregate.body.setTargetTransform(
      entry.node.position,
      entry.node.rotationQuaternion,
    );
  }
}

export function activeForkliftLoad({
  forkliftActive,
  proxy,
  entries,
}) {
  if (!forkliftActive || !proxy) {
    return { count: 0, lift: 0, offGround: false };
  }
  const count = [...entries].filter(
    (entry) => entry.forkSupportActive,
  ).length;
  return {
    count,
    lift: proxy.lift,
    offGround: count > 0 && proxy.lift > FORK_CARGO_OFF_GROUND_LIFT,
  };
}
