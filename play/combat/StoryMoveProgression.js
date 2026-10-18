import { MARTIAL_ARTS_MOVES } from "../../src/MartialArtsCombat.js";
import learning from "../data/story-move-learning.json" with { type: "json" };

// The starting repertoire from the S1 move scroll (also the 33 entries with
// zero definition flags in our captured native table). Keep this explicit:
// adding an animation to the sandbox must not silently teach it to Story Ryo.
// Provenance and the optional lessons are documented in
// docs/research/shenmue1/martial-arts-combat.md#story-move-availability.
export const STORY_STARTING_MOVE_IDS = Object.freeze([
  "tigerKnuckle", "elbowSlam", "twistKnuckle", "elbowAssault", "upperKnuckle",
  "sleeveStrike", "rainThrust", "bigWheel", "twinHandWaves", "backfistWillow",
  "avalancheLance", "katanaMistSlash", "mistralFlash",
  "crescentKick", "trampleKick", "sideReaperKick", "againstCascade",
  "surpliceSlash", "thunderKick", "holdAgainstLeg", "brutalTiger", "darkMoon",
  "cycloneKick", "windmill", "overthrow", "sweepThrow", "vortexThrow",
  "mistReaper", "demonDrop", "shoulderBuster", "tenguDrop", "darksideHazuki",
  "backTwistDrop",
]);

// Only acknowledged, persisted lesson outcomes grant permanent access. A
// completed offer, a declined lesson or a sandbox victory is not mastery.
export const STORY_LEARNABLE_MOVES = Object.freeze(learning.moves.map(move => Object.freeze({
  ...move, flag: `story.s1.${move.slug}.learned`,
})));

export function storyScrollForItem(itemKey) {
  return STORY_LEARNABLE_MOVES.find(move => move.itemKey === itemKey) || null;
}

export function storyCombatMoveIds(flags = {}, trainingMoveId = null) {
  const available = new Set(STORY_STARTING_MOVE_IDS);
  for (const {id, flag, replaces} of STORY_LEARNABLE_MOVES) {
    if (flags?.[flag] === true) {
      available.add(id);
      // These four lessons upgrade a command slot in the original move scroll.
      // The unrestricted practice catalog deliberately retains both versions.
      if (replaces) available.delete(replaces);
    }
  }
  if (trainingMoveId !== null) {
    if (!MARTIAL_ARTS_MOVES[trainingMoveId]) throw new Error(`Unknown training move: ${trainingMoveId}`);
    // Encounter-local permission, never a save mutation: cancelled lessons
    // must not leave the move available in the next ordinary fight.
    available.add(trainingMoveId);
  }
  return [...available];
}
