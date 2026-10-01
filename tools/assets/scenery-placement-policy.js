import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";
import { mapTransitionForObject } from "../../src/MapTransitions.js";

export function sceneryPlacementId(placement) {
  const runtime = placement.runtime || {};
  return placement.id || (runtime.objectTag && `${runtime.objectTag}${
    Number.isInteger(runtime.staticVariantIndex) ? `:variant-${runtime.staticVariantIndex}` : ""}`);
}

/**
 * Conservative D000 experiment policy, not a generic "kind:none means static"
 * rule. MAPINFO type-1 proxies and independently audited passive fixtures are
 * the only admitted classes. New/unknown records remain runtime-owned.
 */
export function auditFixedSceneryPlacements(placements, sceneObjects, fixtureEvidence) {
  const scheduled = new Set(sceneObjects.flatMap(row => [row.code, row.pairedObjectCode]).filter(Boolean));
  const rows = placements.map(placement => {
    const runtime = placement.runtime || {};
    const tag = runtime.objectTag;
    const behavior = jomoObjectBehavior(placement.model, tag, runtime);
    const row = {id: sceneryPlacementId(placement), model: placement.model, tag: tag || null,
      included: false, reason: "unreviewed-ownership"};
    if (!row.id) throw new Error(`Placement needs a stable ID: ${placement.model}`);
    if (scheduled.has(tag)) return {...row, reason: "scheduled-or-paired-object"};
    if (runtime.stateDependent || runtime.inactiveBelowMap || runtime.authoredMovementFile
      || runtime.authoredMovement?.length || behavior.initiallyEnabled === false
      || behavior.ambientAnimation || behavior.stateTransitionAnimation) {
      return {...row, reason: "state-or-animation-owned"};
    }
    if (runtime.nativeStaticTransition || mapTransitionForObject({worldId: "dobuita", objectTag: tag, model: placement.model})) {
      return {...row, reason: "travel-owned"};
    }
    if (behavior.kind === "none" && !tag && runtime.staticDoorType === 1
      && runtime.placementSource === "mapinfo-static-door-table"
      && Number.isInteger(runtime.staticDoorIndex) && runtime.staticSourceOffset) {
      return {...row, included: true, reason: "fixed-mapinfo-proxy"};
    }
    const evidence = fixtureEvidence.status === "verified" && fixtureEvidence.fixtures.find(fixture => (
      fixture.tag === tag && fixture.model === placement.assetFile
    ));
    if (behavior.kind === "passive-scenery" && evidence?.classification === "fixed passive scenery"
      && evidence.fixedAcrossCaptures && evidence.modelEvidence.renderKeys.length === 1
      && evidence.modelEvidence.renderKeys[0] === -1 && evidence.directHmdlTransforms.length === 0
      && evidence.directDispatch.length === 1 && evidence.directDispatch[0].operationHex === "0x001f"
      && JSON.stringify(evidence.directDispatch[0].arguments) === JSON.stringify([tag, 1])) {
      return {...row, included: true, reason: "reviewed-passive-fixture"};
    }
    return {...row, reason: behavior.kind === "none" ? row.reason : `runtime-${behavior.kind}`};
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Duplicate placement IDs");
  const reasons = {};
  for (const row of rows) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  return {policy: "d000-fixed-scenery-v1", rows,
    summary: {total: rows.length, included: rows.filter(row => row.included).length,
      retained: rows.filter(row => !row.included).length, scheduledObjectsRetained: sceneObjects.length, reasons}};
}
