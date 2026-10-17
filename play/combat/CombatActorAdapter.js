export function createCombatActorAdapter({
  root,
  animation,
  playerRoot,
  getController,
  setEnabled = () => {},
  targetHeight = 0,
  yawOffset = 0,
}) {
  let sharedPair = false;
  const yaw = () => root.rotation.y - yawOffset;
  const position = () => {
    // Combat can move a root several times between renders (placement, AI,
    // bounds and paired choreography). Babylon's render-ID cache can otherwise
    // return the previous pose even when its position vector is already dirty.
    root.computeWorldMatrix?.(true);
    return root.getAbsolutePosition();
  };
  const syncCollider = () => {
    const controller = getController();
    if (root !== playerRoot || !controller?.collider) return;
    controller.collider.position.x = root.position.x;
    controller.collider.position.z = root.position.z;
  };
  const releaseOneShot = (blendSeconds = 0.15) => animation.releaseOneShot(
    "combatStance",
    { blendSeconds },
  );
  return {
    position,
    targetPosition() {
      const p = position();
      return { x: p.x, y: p.y + targetHeight, z: p.z };
    },
    yaw,
    setYaw: (value) => { root.rotation.y = value + yawOffset; },
    keepDistanceFrom(other, minimumDistance) {
      const source = position();
      const target = other.position();
      let deltaX = source.x - target.x;
      let deltaZ = source.z - target.z;
      const distance = Math.hypot(deltaX, deltaZ);
      if (distance >= minimumDistance) return false;
      if (distance <= 1e-8) {
        deltaX = -Math.sin(other.yaw());
        deltaZ = -Math.cos(other.yaw());
      } else {
        deltaX /= distance;
        deltaZ /= distance;
      }
      root.position.x = target.x + deltaX * minimumDistance;
      root.position.z = target.z + deltaZ * minimumDistance;
      syncCollider();
      return true;
    },
    alignPairedTo(other, { distance } = {}) {
      const yaw = other.yaw();
      root.rotation.y = yaw + yawOffset;
      if (!Number.isFinite(distance)) return;
      const source = other.position();
      root.position.x = source.x + Math.sin(yaw) * distance;
      root.position.z = source.z + Math.cos(yaw) * distance;
      syncCollider();
      animation.rebaseOneShotRootMotion();
    },
    activeOneShotRootMotionKind: () => animation.activeOneShotRootMotionKind(),
    activeOneShotChoreographySample: () => (
      animation.activeOneShotChoreographySample()
    ),
    combatVisualPosition() {
      const current = position();
      const translation = animation.activeOneShotPoseRootTranslation();
      if (!translation) return current;
      const yaw = root.rotation.y - yawOffset;
      const right = translation[0];
      const forward = -translation[2];
      return {
        x: current.x + right * Math.cos(yaw) + forward * Math.sin(yaw),
        y: current.y + translation[1],
        z: current.z - right * Math.sin(yaw) + forward * Math.cos(yaw),
      };
    },
    setSharedPair: (active) => { sharedPair = Boolean(active); },
    releasePaired({ atomic = false } = {}) {
      let committedPoseRoot = false;
      if (sharedPair) {
        const translation = animation.activeOneShotPoseRootTranslation();
        if (translation) {
          const yaw = root.rotation.y - yawOffset;
          const right = translation[0];
          const forward = -translation[2];
          root.position.x += right * Math.cos(yaw) + forward * Math.sin(yaw);
          root.position.z += -right * Math.sin(yaw) + forward * Math.cos(yaw);
          syncCollider();
          committedPoseRoot = true;
        }
      }
      sharedPair = false;
      // The old routed pose still contains the local root offset we just
      // baked into world space. Blending from it would apply that offset twice.
      return releaseOneShot(committedPoseRoot || atomic ? 0 : 0.15);
    },
    setCombatPosition(x, z, yaw) {
      root.position.x = x;
      root.position.z = z;
      root.rotation.y = yaw + yawOffset;
      syncCollider();
      animation.rebaseOneShotRootMotion();
    },
    setEnabled,
    placeAtOffset(other, { right, forward }) {
      const source = other.position();
      const yaw = other.yaw();
      root.position.set(
        source.x + Math.cos(yaw) * right + Math.sin(yaw) * forward,
        source.y,
        source.z - Math.sin(yaw) * right + Math.cos(yaw) * forward,
      );
      root.rotation.y = Math.atan2(source.x - root.position.x, source.z - root.position.z) + yawOffset;
    },
    placeRelativeTo(other, distance) {
      const source = other.position();
      const yaw = other.yaw();
      root.position.set(
        source.x + Math.sin(yaw) * distance,
        source.y,
        source.z + Math.cos(yaw) * distance,
      );
      root.rotation.y = yaw + Math.PI + yawOffset;
    },
    placeBeside(other, distance) {
      const source = other.position();
      const yaw = other.yaw();
      root.position.set(
        source.x + Math.cos(yaw) * distance,
        source.y,
        source.z - Math.sin(yaw) * distance,
      );
      root.rotation.y = yaw - Math.PI / 2 + yawOffset;
    },
    moveFacing(distance) {
      root.position.x += Math.sin(yaw()) * distance;
      root.position.z += Math.cos(yaw()) * distance;
    },
    playMove: (moveId, options) => animation.playCombatMove(moveId, options),
    playStringStage: (stageId, options) => (
      animation.playCombatStringStage(stageId, options)
    ),
    playFollowupStage: (stageId, options) => (
      animation.playCombatFollowupStage(stageId, options)
    ),
    playFollowupVictim: (stageId, options) => (
      animation.playCombatFollowupVictim(stageId, options)
    ),
    playMoveVictim: (moveId, options) => (
      animation.playCombatMoveVictim(moveId, options)
    ),
    playOpponentMoveVictim: (moveId, options) => (
      animation.playCombatOpponentVictim(moveId, options)
    ),
    playReaction: (reaction) => animation.playCombatReaction(reaction, {
      holdLastFrame: reaction === "defeated" || reaction === "knockdown",
    }),
    releaseReaction() {
      sharedPair = false;
      return releaseOneShot();
    },
  };
}

