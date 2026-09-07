// FUN_0c092f14 resolves every scheduled-actor motion request through a
// process-wide linked list of registered motion-bank ranges. The operation
// which submitted the request does not select the bank.
//
// These two ranges were verified against the live registry at 0x0c218408:
//   (0x0000, 0x0618) -> MOTION.BIN (1559 sequences)
//   (0x8000, 0x8358) -> M_MOBJ.BIN (855 sequences)
//
// Both bounds are exclusive in the original lookup. Sequence indices are
// zero-based, while the registered motion IDs begin one after the lower bound.
export const SCHEDULED_ACTOR_MOTION_BANK_RANGES = Object.freeze([
  Object.freeze({
    bank: "free",
    lowerExclusive: 0x0000,
    upperExclusive: 0x0618,
  }),
  Object.freeze({
    bank: "mobj",
    lowerExclusive: 0x8000,
    upperExclusive: 0x8358,
  }),
]);

export function scheduledActorMotionId(motionStateId) {
  return Number.isInteger(motionStateId)
    ? motionStateId & 0xffff
    : null;
}

export function resolveScheduledActorMotionState(motionStateId) {
  const motionId = scheduledActorMotionId(motionStateId);
  if (motionId === null) return null;
  const range = SCHEDULED_ACTOR_MOTION_BANK_RANGES.find(
    (candidate) => (
      motionId > candidate.lowerExclusive
      && motionId < candidate.upperExclusive
    ),
  );
  if (!range) return null;
  return Object.freeze({
    bank: range.bank,
    index: motionId - range.lowerExclusive - 1,
    motionId,
  });
}

// The subtype-1 operation-0x17 update at FUN_0c0f84b4 calls the game's PRNG,
// reduces the result modulo two through FUN_0c1dc440, and uses that result to
// index the first two 32-bit control values at record +0x1c. These are the
// authored ambient motions for a linked interaction target. The third value
// at +0x24 participates in the interaction transition and is not the standing
// ambient-motion choice.
export function scheduledActorInteractionMotionCandidates(controlValues) {
  if (!Array.isArray(controlValues)) return [];
  return controlValues.slice(0, 2).flatMap((value) => (
    resolveScheduledActorMotionState(value) ? [value & 0xffff] : []
  ));
}
