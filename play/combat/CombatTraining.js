import { COMBAT_TICKS_PER_SECOND, distanceAndFacing, MARTIAL_ARTS_MOVES } from "../../src/MartialArtsCombat.js";
import { combatCommandGroups } from './CombatCommandDisplay.js';

// A lesson configures the regular combat session. It observes real completion
// events, never duplicates command recognition or awards mastery for key presses.
export function completedTrainingMove(training, events, playerId) {
  return events.some(event => event.type === "move-ended" && event.combatantId === playerId
    && event.moveId === training.completionMoveId && (!training.requiresContact || Boolean(event.defenderId)));
}

export function trainingInstructions(training, bindings) {
  const names = { up: "Forward", down: "Back", hand: "Punch", leg: "Kick", throw: "Throw", guard: "Guard" };
  const key = token => (bindings[token] || "").replace(/^Key|^Digit/, "").replace("Arrow", "");
  const commands = combatCommandGroups(MARTIAL_ARTS_MOVES[training.moveId].nativeInput)
    .map(group => group.filter(token=>token!=="plus").map(token=>`${names[token] || token} (${key(token)})`).join(" + ")).join(" → ");
  return `${commands}\n${training.instruction}\nPractice freely; cancel to leave. No time limit.`;
}

export class CombatTrainingCoach {
  constructor(training) { this.training = training; this.cooldown = 0; }
  decide(coach, player) {
    if (!this.training.attackMoveId || coach.action || coach.reaction || player.action || player.reaction) return { kind: "idle" };
    const relation = distanceAndFacing(coach, player);
    // The teaching strike must be inside BOTH moves' reach. A long-range punch
    // just outside the counter's reach would make the lesson impossible.
    const range = Math.min(MARTIAL_ARTS_MOVES[this.training.moveId].range, MARTIAL_ARTS_MOVES[this.training.attackMoveId].range) * .9;
    if (relation.distance > range + .01) return { kind: "approach", turnYaw: relation.targetYaw, distance: Math.min(.06, relation.distance - range) };
    if (this.cooldown-- > 0) return { kind: "idle", turnYaw: relation.targetYaw };
    // Predictable repeated strikes are an authored teaching aid, not recovered
    // original instructor AI. Actual counter timing is the shared combat rule.
    this.cooldown = 3 * COMBAT_TICKS_PER_SECOND;
    return { kind: "move", moveId: this.training.attackMoveId, turnYaw: relation.targetYaw };
  }
}
