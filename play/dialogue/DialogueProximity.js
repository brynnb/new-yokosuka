export const DIALOGUE_INTERACTION_DISTANCE = 3;

export function isWithinDialogueRange(
  playerPosition,
  npcPosition,
  maximumDistance = DIALOGUE_INTERACTION_DISTANCE,
) {
  if (
    !playerPosition
    || !npcPosition
    || !Number.isFinite(playerPosition.x)
    || !Number.isFinite(playerPosition.z)
    || !Number.isFinite(npcPosition.x)
    || !Number.isFinite(npcPosition.z)
    || !Number.isFinite(maximumDistance)
    || maximumDistance < 0
  ) {
    return false;
  }

  return Math.hypot(
    playerPosition.x - npcPosition.x,
    playerPosition.z - npcPosition.z,
  ) <= maximumDistance;
}
