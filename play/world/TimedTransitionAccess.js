import timedTransitionAccess from "../data/timed-transition-access.json" with {
  type: "json",
};

const rulesByTransitionId = new Map(
  timedTransitionAccess.rules.map((rule) => [rule.transitionId, rule]),
);
const alwaysAccessibleInteriorWorldIds = new Set(
  timedTransitionAccess.alwaysAccessibleInteriorWorldIds,
);
const controlledDestinationWorldIds = new Set(
  timedTransitionAccess.rules
    .map((rule) => rule.destination.worldId)
    .filter((worldId) => !alwaysAccessibleInteriorWorldIds.has(worldId)),
);
const presentationOnlyDoorKeys = new Set(
  timedTransitionAccess.presentationOnlyAssociations.map(
    (association) => (
      `${association.sourceWorldId}:${association.doorSelector}`
    ),
  ),
);
const nativeLayerDoorBlockerKeys = new Set([
  ...timedTransitionAccess.rules,
  ...timedTransitionAccess.presentationOnlyAssociations,
].filter((association) => (
  Number.isInteger(association.source?.doorSelector)
    || Number.isInteger(association.doorSelector)
)).filter((association) => (
  Number.isInteger(association.source?.layer)
    || Number.isInteger(association.layer)
)).map((association) => {
  const source = association.source || association;
  return `${source.worldId || source.sourceWorldId}:`
    + `${source.doorSelector}:${source.layer}`;
}));

export function timedAccessRuleForTransition(transitionOrId) {
  const transitionId = typeof transitionOrId === "string"
    ? transitionOrId
    : transitionOrId?.id;
  const rule = rulesByTransitionId.get(transitionId) || null;
  return rule && !isAlwaysAccessibleInterior(rule.destination.worldId)
    ? rule
    : null;
}

export function isAlwaysAccessibleInterior(worldId) {
  return alwaysAccessibleInteriorWorldIds.has(worldId);
}

export function isPresentationOnlyDoorSelector(worldId, doorSelector) {
  return presentationOnlyDoorKeys.has(`${worldId}:${doorSelector}`);
}

export function isTimedAccessControlledDestination(worldId) {
  return controlledDestinationWorldIds.has(worldId);
}

export function isNativeLayerDoorBlocker(
  worldId,
  doorSelector,
  layer,
) {
  return nativeLayerDoorBlockerKeys.has(
    `${worldId}:${doorSelector}:${layer}`,
  );
}

export function timedTransitionAccessManifest() {
  return timedTransitionAccess;
}
