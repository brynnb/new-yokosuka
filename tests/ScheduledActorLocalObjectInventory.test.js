import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-local-object-inventory.json",
  "utf8",
));

test("local-object inventory preserves the native record and dispatch", () => {
  assert.equal(evidence.nativeEvidence.registrationHandler, "0x0c11d1de");
  assert.equal(evidence.nativeEvidence.transitionHandler, "0x0c11d2b6");
  assert.equal(evidence.nativeEvidence.actorLocalObjectListOffset, "0x94");
  assert.equal(evidence.nativeEvidence.recordByteLength, 56);
  assert.equal(evidence.nativeEvidence.controllerNodeResolver, "0x0c1140e6");
  assert.equal(evidence.nativeEvidence.controllerRecordSearch, "0x0c092ea0");
  assert.equal(evidence.nativeEvidence.controllerRecordByteLength, 72);
  assert.equal(evidence.nativeEvidence.controllerRecordMatrixOffset, "0x44");
  assert.equal(
    evidence.nativeEvidence.placementModeTargets["2"].nativeNodeId,
    12,
  );
  assert.equal(
    evidence.nativeEvidence.placementModeTargets["10"].kind,
    "actor-controller-transform",
  );
  assert.equal(
    evidence.nativeEvidence.placementModeTargets["11"].kind,
    "actor-world-transform",
  );
});

test("all extracted local-object records have exact native placement modes", () => {
  assert.ok(evidence.summary.uniqueRegistrationCount > 100);
  assert.ok(evidence.summary.uniqueTransitionCount > 100);
  assert.ok(evidence.summary.actorCodeCount > 50);
  for (const record of evidence.registrations) {
    assert.match(record.sourceProgramByteSha256, /^[0-9a-f]{64}$/);
    assert.match(record.sourceOffset, /^0x[0-9a-f]+$/);
    assert.ok(record.nativePlacementTarget);
    assert.ok(record.placementMode >= 0 && record.placementMode < 12);
  }
});

test("Fukuhara sweep attachment resolves to the exact scene object", () => {
  const sweep = evidence.fukuhara.registrations.filter(
    (record) => record.objectCode === "ITEM"
      && record.locationCode === "SO01"
      && record.placementMode === 2,
  );
  assert.ok(sweep.length >= 2);
  assert.ok(sweep.some((record) => record.area === "JHD0"));
  assert.ok(sweep.some((record) => record.area === "JOMO"));
  assert.ok(sweep.every(
    (record) => record.nativePlacementTarget.nativeNodeId === 12,
  ));
  assert.ok(sweep.some(
    (record) => record.runtimeLocationCandidates.some(
      (candidate) => candidate.model === "S1_JHD0_HOUS501G.MT5",
    ),
  ));
  assert.deepEqual(
    evidence.fukuhara.sweepPropResolution.runtimeCandidateModels.sort(),
    [
      "S1_JHD0_HOUS501G.MT5",
      "S1_JOMO_HOUS501G.MT5",
    ],
  );
  assert.equal(
    evidence.fukuhara.sweepPropResolution.resolvedModelBasename,
    "HOUS501G.MT5",
  );
  assert.equal(
    evidence.fukuhara.sweepPropResolution.nativeControllerNodeId,
    12,
  );
  assert.equal(
    evidence.fukuhara.sweepPropResolution.resolutionStatus,
    "exact runtime scene-object owner model",
  );
});
