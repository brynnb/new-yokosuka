// First world login is the existing durable boundary. Do not stamp it until
// the opening has finished: closing/reloading during playback must be retryable.
export const NEW_CHARACTER_OPENING = Object.freeze([
  "S1-OP02-00",
  "S1-000",
  "S1-OP00-MAIL",
  "S1-OP00-DREAM",
]);

// OP00's owner requests JOMO entry 1 after awakening (0x2054e).
// JOMO MAPINFO entry at 0xcab14, projected to browser coordinates. This is the
// bedside arrival, not the house's generic menu/entrance spawn.
const bedsidePosition = Object.freeze([-17.600000381469727, 0, 4.099999904632568]);
export const NEW_CHARACTER_OPENING_ARRIVAL = Object.freeze({
  worldId: "interior",
  position: bedsidePosition,
  // Face the doorway instead of retaining the native straight-ahead heading.
  // dor7's hinge is (-16.302, 0, 1.833); DR01_015's closed panel spans
  // local X [-0.9, 0]. Aim at the opening's center, not the swinging panel.
  yaw: Math.atan2(-16.752 - bedsidePosition[0], 1.833 - bedsidePosition[2]),
});

export function needsNewCharacterOpening(character) {
  return Boolean(character?.id && !character.lastLoginAt);
}

export async function playNewCharacterOpening({ character, playCutscene, signal }) {
  if (!needsNewCharacterOpening(character)) return false;
  for (const cutsceneId of NEW_CHARACTER_OPENING) {
    signal?.throwIfAborted();
    // The existing runner owns loading, dialogue isolation and settlement.
    // Its user skip ends the current scene; a failure rejects the sequence.
    await playCutscene(cutsceneId);
    signal?.throwIfAborted();
  }
  return true;
}
