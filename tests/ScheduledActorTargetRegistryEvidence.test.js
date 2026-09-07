import assert from "node:assert/strict";
import test from "node:test";
import evidence from "../tools/evidence/scheduled-actor-target-registry-evidence.json" with {
  type: "json",
};

test("native scheduled target registry is byte-stable in every resident capture", () => {
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.residentRegistryCaptureCount, 248);
  assert.equal(evidence.summary.absentRegistryCaptureCount, 228);
  assert.equal(evidence.summary.captureErrorCount, 0);
  assert.equal(evidence.summary.targetRecordCount, 28);
  assert.equal(evidence.summary.byteStableTargetSubtypeCount, 28);
  assert.equal(evidence.summary.recordObservationCount, 28 * 248);
  for (const target of evidence.targets) {
    assert.equal(target.byteStableSubtype, true);
    assert.ok([0, 1, 3].includes(target.targetSubtype));
    assert.equal(target.captureCount, 248);
    assert.equal(target.observationCount, 248);
    assert.equal(target.recordIndices.length, 1);
  }
});

test("every operation-0x17/0x18 source target has an exact native subtype", () => {
  assert.equal(evidence.summary.sourceTargetCodeCount, 25);
  assert.equal(evidence.summary.exactSourceTargetSubtypeCount, 25);
  assert.equal(evidence.summary.unresolvedSourceTargetSubtypeCount, 0);
  assert.deepEqual(evidence.unresolvedSourceTargetCodes, []);
  const sourceTargets = evidence.targets.filter(
    (target) => target.referencedBySource,
  );
  assert.equal(sourceTargets.length, 25);
  assert.ok(sourceTargets.every((target) => (
    target.sourceOperationCounts.operation17 > 0
    || target.sourceOperationCounts.operation18 > 0
  )));
});

test("reviewed registry subtype families retain their exact codes", () => {
  const subtypeByCode = new Map(
    evidence.targets.map((target) => [
      target.targetCode,
      target.targetSubtype,
    ]),
  );
  assert.equal(subtypeByCode.get("BUSW"), 0);
  assert.equal(subtypeByCode.get("BUSM"), 0);
  assert.equal(subtypeByCode.get("FANY"), 3);
  assert.equal(subtypeByCode.get("DBEN"), 3);
  assert.equal(subtypeByCode.get("WDG1"), 1);
  assert.equal(subtypeByCode.get("MARY"), 1);
});
