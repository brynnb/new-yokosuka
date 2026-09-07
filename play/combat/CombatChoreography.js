// Shenmue's paired motions are authored in a shared local coordinate space.
// Each entry opts a synchronized actor/victim pair into frame-zero placement;
// the actual offsets come from the selected native clips (including expert and
// opponent variants), rather than from hand-tuned gameplay distances.
export const COMBAT_PAIR_CHOREOGRAPHY = Object.freeze(Object.fromEntries([
  ["swallowFlip", "counter"],
  ["overthrow", "throw"],
  ["sweepThrow", "throw"],
  ["vortexThrow", "throw"],
  ["mistReaper", "throw"],
  ["demonDrop", "throw"],
  ["shoulderBuster", "throw"],
  ["tenguDrop", "throw"],
  ["darksideHazuki", "positional-throw"],
  ["backTwistDrop", "positional-throw"],
  ["armBreakFire", "throw-string"],
  ["tigerStorm", "throw"],
  ["shadowBlade", "counter"],
  ["crossCharge", "counter"],
  ["swallowFlipThrow", "throw-stage"],
  ["swallowFlipPunch", "throw-stage"],
  ["armBreakChestStrike", "throw-stage"],
  ["armBreakFireFinish", "throw-stage"],
].map(([id, kind]) => [id, Object.freeze({
  id,
  kind,
  anchor: "attacker",
  placement: "authored-frame-zero",
})])));

function finiteTranslation(sample) {
  return Boolean(
    sample
    && Array.isArray(sample.authoredTranslation)
    && sample.authoredTranslation.length >= 3
    && sample.authoredTranslation.every(Number.isFinite)
    && Array.isArray(sample.embeddedTranslation)
    && sample.embeddedTranslation.length >= 3
    && sample.embeddedTranslation.every(Number.isFinite)
  );
}

// Matches CombatRootMotion's conversion from native MOTN X/Z into NY world
// space. Native -Z is actor-forward and native +X is actor-right.
export function combatLocalToWorld(x, z, yaw) {
  const forward = -z;
  return {
    x: x * Math.cos(yaw) + forward * Math.sin(yaw),
    z: -x * Math.sin(yaw) + forward * Math.cos(yaw),
  };
}

export function positionAuthoredCombatPair(
  attacker,
  defender,
  choreographyId,
  { anchor = null } = {},
) {
  const choreography = COMBAT_PAIR_CHOREOGRAPHY[choreographyId];
  const attackerSample = attacker?.activeOneShotChoreographySample?.();
  const defenderSample = defender?.activeOneShotChoreographySample?.();
  if (
    !choreography
    || !finiteTranslation(attackerSample)
    || !finiteTranslation(defenderSample)
    || !attacker?.setCombatPosition
    || !defender?.setCombatPosition
  ) {
    return null;
  }

  const attackerPosition = anchor || attacker.combatVisualPosition?.()
    || attacker.position?.();
  const yaw = attacker.yaw?.();
  if (
    !attackerPosition
    || !Number.isFinite(attackerPosition.x)
    || !Number.isFinite(attackerPosition.z)
    || !Number.isFinite(yaw)
  ) {
    return null;
  }

  const attackerAuthored = attackerSample.authoredTranslation;
  const defenderAuthored = defenderSample.authoredTranslation;
  const authoredGap = combatLocalToWorld(
    defenderAuthored[0] - attackerAuthored[0],
    defenderAuthored[2] - attackerAuthored[2],
    yaw,
  );
  const attackerEmbedded = combatLocalToWorld(
    attackerSample.embeddedTranslation[0],
    attackerSample.embeddedTranslation[2],
    yaw,
  );
  const defenderEmbedded = combatLocalToWorld(
    defenderSample.embeddedTranslation[0],
    defenderSample.embeddedTranslation[2],
    yaw,
  );

  attacker.setCombatPosition(
    attackerPosition.x - attackerEmbedded.x,
    attackerPosition.z - attackerEmbedded.z,
    yaw,
  );
  defender.setCombatPosition(
    attackerPosition.x + authoredGap.x - defenderEmbedded.x,
    attackerPosition.z + authoredGap.z - defenderEmbedded.z,
    yaw,
  );
  // Pose-root clips retain their authored root inside the skeleton. Mark both
  // participants so release commits any remaining pose offset into world
  // space; travel-root clips safely have no embedded offset to commit.
  attacker.setSharedPair?.(true);
  defender.setSharedPair?.(true);

  return {
    choreography,
    anchor: { x: attackerPosition.x, z: attackerPosition.z },
    yaw,
    authoredGap,
    authoredDistance: Math.hypot(authoredGap.x, authoredGap.z),
  };
}
