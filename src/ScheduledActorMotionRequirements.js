import {
  resolveScheduledActorMotionState,
  scheduledActorInteractionMotionCandidates,
} from "./ScheduledActorMotionRegistry.js";
import motionManifest from "../play/data/scheduled-actor-motions.json" with {
  type: "json",
};

const STATE_NAME_BY_BANK_AND_INDEX = Object.fromEntries(
  Object.entries(motionManifest.stateNames).map(([bank, rows]) => [
    bank,
    new Map(rows.map((row) => [row.index, row.name])),
  ]),
);

export function scheduledActorMotionRequirements(definitions) {
  if (definitions?.motionRequirements) {
    return Object.fromEntries(
      Object.entries(definitions.motionRequirements).map(([bank, names]) => [
        bank,
        [...names],
      ]),
    );
  }

  const names = {
    mbas: new Set(),
    free: new Set(),
    mobj: new Set(),
  };
  for (const definition of definitions || []) {
    const defaultMotion = resolveScheduledActorMotionState(
      definition.nativeDefaultMotionStateId,
    );
    if (defaultMotion) {
      const defaultName = STATE_NAME_BY_BANK_AND_INDEX[
        defaultMotion.bank
      ]?.get(defaultMotion.index);
      if (defaultName) names[defaultMotion.bank].add(defaultName);
    }
    for (const journey of definition.journeys || []) {
      for (const operation of journey.operations || []) {
        if (operation.operation === 1) {
          const profile = motionManifest.movementProfiles[
            operation.movementMode
          ];
          if (profile) names[profile.bank].add(profile.name);
          continue;
        }
        const motionStateIds = operation.operation === 0x17
          ? scheduledActorInteractionMotionCandidates(
              operation.controlValues,
            )
          : (
              operation.operation === 0x1c
              && Number.isInteger(operation.secondaryControlWord)
            )
            ? [operation.secondaryControlWord]
          : (
              operation.operation === 0x30
              && operation.actionControllerId
            )
            ? [operation.actionControllerId]
          : (
              operation.operation === 0x35
              && (
                operation.routeCompletionMotionOverrideId
                || operation.routeCompletionDefaultIdleCandidateMotionIds
              )
            )
            ? (
                operation.routeCompletionMotionOverrideId
                  ? [operation.routeCompletionMotionOverrideId]
                  : operation.routeCompletionDefaultIdleCandidateMotionIds
                    || []
              )
          : (
              operation.operation === 2
              || operation.operation === 0x19
              || operation.operation === 0x1a
            )
            ? (
                operation.operation === 0x19
                && operation.motionStateControlWord === 0
              )
              ? []
              : [operation.motionStateId]
            : [];
        for (const motionStateId of motionStateIds) {
          const resolved = resolveScheduledActorMotionState(motionStateId);
          if (!resolved) continue;
          const name = STATE_NAME_BY_BANK_AND_INDEX[
            resolved.bank
          ]?.get(resolved.index);
          if (name) names[resolved.bank].add(name);
        }
      }
    }
  }
  return Object.fromEntries(
    Object.entries(names).map(([bank, values]) => [bank, [...values]]),
  );
}
