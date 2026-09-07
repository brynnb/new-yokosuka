import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coverage = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-animation-coverage.json",
  import.meta.url,
), "utf8"));

test("S2 animation coverage separates models, rest profiles, and motions", () => {
  assert.equal(
    coverage.schema,
    "new-yokosuka-shenmue2-animation-coverage-v1",
  );
  assert.equal(coverage.summary.nativeHumanActorBindingCount, 776);
  assert.equal(coverage.summary.nativeHumanModelCount, 715);
  assert.equal(coverage.summary.nativeHumanRestProfileCount, 16);
  assert.equal(coverage.nativeRestProfileCoverage.length, 16);
  assert.equal(coverage.nativeModelInventory.length, 715);
  assert.equal(coverage.summary.availableCharacterModelCount, 120);
  assert.equal(coverage.summary.availableCharacterRestProfileCount, 16);
  assert.equal(coverage.summary.exactNativeAvailableCharacterModelCount, 120);
  assert.equal(coverage.availableModelAssets.length, 120);
  assert.ok(coverage.availableModelAssets.every(({ exactNativeBytes }) => (
    exactNativeBytes
  )));
  assert.ok(coverage.specialActorModelInventory.some((binding) => (
    binding.actorCode === "RYO_"
    && binding.modelCode === "RYO_M"
  )));
  assert.deepEqual(
    coverage.coverage.extractedModelsDifferingFromNativeHumans,
    [],
  );
  assert.equal(coverage.summary.crowdReferencedModelCount, 102);
  assert.equal(coverage.summary.crowdRestProfileCount, 6);
  assert.equal(coverage.summary.crowdRestProfileMotionPairCount, 6);
  assert.equal(coverage.summary.crowdLocomotionMotionCount, 6);
  assert.equal(coverage.modelMotionPairs.length, 102);
  assert.ok(coverage.modelMotionPairs.every((pair) => (
    pair.modelCode.endsWith("_L")
    && /^[A-Z]{3}$/.test(pair.restProfile)
    && /^0x[0-9a-f]{4}$/.test(pair.motionId)
  )));
});

test("S2 coverage does not claim a model from a shared native motion ID", () => {
  assert.match(
    coverage.evidenceBoundary,
    /matching motion ID alone does not identify a model/i,
  );
  assert.ok(coverage.summary.nativeControllerObservationCount >= 494);
  assert.ok(coverage.summary.nativeObservedPrimaryMotionCount >= 21);
  assert.equal(
    coverage.summary.strictFixtureCount,
    coverage.fixtures.filter(({ status }) => status === "strict-native").length,
  );
  assert.ok(coverage.summary.strictFixtureCount >= 26);
  assert.equal(
    coverage.summary.exactNativeDiscrepancyFixtureCount,
    coverage.fixtures.filter(
      ({ status }) => status === "exact-native-discrepancy",
    ).length,
  );
  assert.equal(
    coverage.summary.exactNativeDiscrepancyFrameCount,
    coverage.fixtures.filter(
      ({ status }) => status === "exact-native-discrepancy",
    ).reduce((sum, fixture) => sum + fixture.frameCount, 0),
  );
  assert.equal(coverage.summary.strictFixtureCount, 37);
  assert.equal(coverage.summary.exactNativeDiscrepancyFixtureCount, 1);
  assert.equal(coverage.summary.exactNativeDiscrepancyFrameCount, 1);
  assert.equal(coverage.summary.strictFixtureRestProfileCount, 10);
  assert.equal(
    coverage.summary.nativeRestProfilesWithoutStrictFixtureCount,
    6,
  );
  assert.equal(coverage.summary.nativeRestProfilesReadyForCaptureCount, 6);
  assert.ok(coverage.summary.strictFixtureMotionCategoryCount >= 3);
  assert.ok(coverage.summary.fixtureAllSlotMotionCount >= 16);
  assert.ok(coverage.summary.strictFixtureIndependentLayerCount >= 4);
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.hasIndependentSlotMotion
    && fixture.motionCategories.includes("independently-layered")
    && fixture.slotMotionIds.includes("0x80c3")
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.motionCategory === "outdoor-locomotion"
    && fixture.runtimeCurveState === "identity-affine"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.motionCategory === "npc-table-action"
    && fixture.runtimeCurveState === "captured-affine"
  )));
  assert.ok(coverage.summary.fixtureCoveredRestProfileMotionPairCount >= 4);
  assert.ok(coverage.fixtures.every((fixture) => (
    fixture.actorCode
    && fixture.exactRenderedModelIdentity === "resolved"
  )));
  assert.ok(coverage.nativeFixtureSourceCandidates.some((candidate) => (
    candidate.exactActorModelBindingCount > 0
    && candidate.actorCodes.length === candidate.modelCodes.length
  )));
  const relocatedJn5 = coverage.nativeFixtureSourceCandidates.find(
    ({ actorCodes, motionId }) => (
      actorCodes.length === 1
      && actorCodes[0] === "04C_"
      && motionId === "0xf086"
    ),
  );
  assert.deepEqual(relocatedJn5?.controllerAddresses, [
    "0x8c8082e8",
    "0x8c834748",
  ]);
  assert.equal(relocatedJn5?.completePoseCaptureCount, 24);
  const reducedA06 = coverage.nativeFixtureSourceCandidates.find(
    ({ actorCodes, motionId }) => (
      actorCodes.length === 1
      && actorCodes[0] === "A06_"
      && motionId === "0x80eb"
    ),
  );
  assert.deepEqual(reducedA06?.controllerAddresses, [
    "0x8c7cb6a8",
    "0x8c7dc888",
  ]);
  assert.equal(reducedA06?.completePoseCaptureCount, 2);
  assert.deepEqual(reducedA06?.existingFixtureIds, [
    "80eb-a06_e-native",
  ]);
  const xhoDiscrepancy = coverage.nativeFixtureSourceCandidates.find(
    ({ actorCodes, motionId }) => (
      actorCodes.length === 1
      && actorCodes[0] === "XHO_"
      && motionId === "0xe381"
    ),
  );
  assert.deepEqual(xhoDiscrepancy?.existingFixtureIds, [
    "e381-xho-native",
  ]);
  assert.ok(coverage.nextFixtureCandidates.every((candidate) => (
    candidate.nativeControllerObservationCount > 0
    && candidate.profileMotionFixtureIds.length === 0
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.restProfile === "MEI"
    && fixture.motionId === "0xf07e"
    && fixture.modelCode === "RRN_L"
    && fixture.actorCode === "04F_"
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.restProfile === "BBY"
    && fixture.motionId === "0xe0e3"
    && fixture.modelCode === "MII_L"
    && fixture.actorCode === "MII_"
    && fixture.frameCount === 6
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.restProfile === "WON"
    && fixture.motionId === "0xe0e3"
    && fixture.modelCode === "WON_M"
    && fixture.actorCode === "WON_"
    && fixture.frameCount === 12
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.restProfile === "SAM"
    && fixture.motionId === "0x8036"
    && fixture.modelCode === "JUK_L"
    && fixture.actorCode === "JUK_"
    && fixture.frameCount === 6
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.restProfile === "SAM"
    && fixture.motionId === "0x803b"
    && fixture.modelCode === "TB1_L"
    && fixture.actorCode === "TB1_"
    && fixture.frameCount === 7
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.restProfile === "LLY"
    && fixture.motionId === "0xf078"
    && fixture.status === "strict-native"
  )));
  assert.ok(coverage.nativeRestProfileCoverage.some((profile) => (
    profile.restProfile === "RYO"
    && profile.status === "strict-native"
    && profile.availableModelCodes.includes("REN_M")
    && profile.availableModelCodes.includes("RYO_M")
    && profile.observedMotionIds.includes("0xf002")
    && profile.fixtureIds.includes("f002-ryo_m-native")
    && profile.fixtureIds.includes("f006-ryo_m-native")
    && profile.requiredEvidence === null
  )));
  assert.ok(coverage.nativeRestProfileCoverage.some((profile) => (
    profile.restProfile === "MEI"
    && profile.status === "strict-native"
    && profile.availableModelCodes.includes("RRN_L")
    && profile.fixtureIds.includes("f07e-rrn_l-native")
    && profile.requiredEvidence === null
  )));
  for (const { restProfile, modelCode, actorCode } of [
    { restProfile: "CHA", modelCode: "CHA_M", actorCode: "CHA_" },
    { restProfile: "HGN", modelCode: "HGN_L", actorCode: "HGN_" },
    { restProfile: "JOY", modelCode: "JOY_M", actorCode: "JOY_" },
    { restProfile: "SIN", modelCode: "SIN_M", actorCode: "SIN_" },
    { restProfile: "TGY", modelCode: "TGY_M", actorCode: "TGY_" },
    { restProfile: "YUA", modelCode: "YUA_M", actorCode: "YUA_" },
  ]) {
    assert.ok(coverage.missingNativeProfileCaptureTargets.some((target) => (
      target.restProfile === restProfile
      && target.modelCode === modelCode
      && target.actorCodes.includes(actorCode)
      && /17 visible solver matrices/i.test(target.requiredEvidence)
    )));
  }
  const sye = coverage.nativeRestProfileCoverage.find(
    ({ restProfile }) => restProfile === "SYE",
  );
  assert.equal(sye?.status, "strict-native");
  assert.deepEqual(sye?.availableModelCodes, ["SYE_M"]);
  assert.deepEqual(sye?.fixtureIds, [
    "e101-sye_m-native",
    "f060-sye_m-native",
  ]);
  assert.equal(sye?.requiredEvidence, null);
  assert.ok(coverage.fixtures.some((fixture) => (
    fixture.id === "e101-sye_m-native"
    && fixture.restProfile === "SYE"
    && fixture.motionId === "0xe101"
    && fixture.motionBank === "npcTable"
    && fixture.modelCode === "SYE_M"
    && fixture.actorCode === "SYE_"
    && fixture.frameCount === 4
    && fixture.status === "strict-native"
  )));
});
