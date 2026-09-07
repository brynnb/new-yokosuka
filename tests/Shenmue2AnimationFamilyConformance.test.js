import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coverage = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-animation-coverage.json",
  import.meta.url,
), "utf8"));
const family = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-animation-family-conformance.json",
  import.meta.url,
), "utf8"));

test("S2 native fixtures gate every compatible bundled character", () => {
  assert.equal(
    family.schema,
    "new-yokosuka-shenmue2-animation-family-conformance-v1",
  );
  assert.equal(family.summary.representedRestProfileCount, 10);
  assert.equal(family.summary.representedModelCount, 114);
  assert.equal(family.summary.nativeReferenceFixtureCount, 37);
  assert.equal(family.summary.representedPrimaryMotionCount, 27);
  assert.equal(family.summary.representedMotionCategoryCount, 5);
  assert.equal(family.summary.modelFixtureObservationCount, 744);
  assert.equal(family.summary.evaluatedModeCount, 1488);
  assert.equal(family.summary.failedObservationCount, 0);

  const expectedModels = new Set(coverage.nativeRestProfileCoverage
    .filter(({ status }) => status === "strict-native")
    .flatMap(({ availableModelCodes }) => availableModelCodes));
  assert.deepEqual(
    new Set(family.observations.map(({ modelCode }) => modelCode)),
    expectedModels,
  );
  assert.ok(family.observations.every((observation) => (
    !observation.error
    && observation.capturedInputs.failures.length === 0
    && observation.decodedMotion.failures.length === 0
  )));
});

test("S2 family conformance preserves exact-model evidence boundaries", () => {
  assert.deepEqual(family.excludedComparisons, []);
  assert.deepEqual(family.fixtureReuseRestrictions.map(({ scope }) => scope), [
    "exact model only",
  ]);
  assert.match(family.evidenceBoundary, /does not replace an exact-model capture/i);
  const a06Observations = family.observations.filter(
    ({ modelCode }) => modelCode === "A06_E",
  );
  assert.equal(a06Observations.length, 7);
  assert.ok(a06Observations.some(({ referenceFixtureId }) => (
    referenceFixtureId === "80eb-a06_e-native"
  )));
  assert.ok(a06Observations.some(({ referenceFixtureId }) => (
    referenceFixtureId === "f060-kmn-native"
  )));
  assert.ok(a06Observations.every(({ scaleBinding }) => (
    scaleBinding.candidateRootScale === 1
    && Math.abs(scaleBinding.actorScale - 1) < 2e-8
    && Math.abs(scaleBinding.motionTranslationScale - 1) < 2e-8
  )));
  assert.equal(family.summary.unrepresentedRestProfileCount, 6);
  assert.equal(family.summary.unrepresentedModelCount, 6);
  assert.deepEqual(
    family.missingNativeProfileCaptureTargets,
    coverage.missingNativeProfileCaptureTargets,
  );
  const represented = new Set(family.observations.map(
    ({ modelCode }) => modelCode,
  ));
  assert.ok(family.missingNativeProfileCaptureTargets.every(
    ({ modelCode }) => !represented.has(modelCode),
  ));
});
