import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  nativeClothBodyCollisionProfile,
  nativeClothCharacterProfile,
  nativeClothClosedRingConstraintProfile,
  nativeClothModelIdentity,
  nativeClothVelocityDamping,
  nativeClothVelocityDampingForMode,
} from "../play/characters/NativeClothProfiles.js";
import {
  NATIVE_CLOTH_BODY_COLLISION_PROFILES,
  NATIVE_CLOTH_CHARACTER_PROFILES,
  NATIVE_CLOTH_FALLBACK_PROFILE,
  NATIVE_CLOTH_SOLVER_PROFILE,
} from "../play/data/native-cloth-profiles.web.js";

test("native cloth profiles resolve model identity with an executable fallback", () => {
  assert.equal(nativeClothModelIdentity("KOK_M.CHRM"), "KOK");
  assert.equal(nativeClothModelIdentity("ine_l"), "INE");
  assert.equal(nativeClothModelIdentity("not-a-model"), null);
  assert.deepEqual(
    nativeClothCharacterProfile("BGM_L.CHRM"),
    NATIVE_CLOTH_FALLBACK_PROFILE,
  );
  assert.notDeepEqual(
    nativeClothCharacterProfile("KOK_M.CHRM"),
    NATIVE_CLOTH_FALLBACK_PROFILE,
  );
});

test("Lan Di and Ine-san select exact executable-owned collision records", () => {
  const lanDiCharacter = nativeClothCharacterProfile("KOK_M");
  assert.equal(lanDiCharacter.profileIndex, 13);
  assert.deepEqual(lanDiCharacter.rawControlBytes, [0, 254, 3, 1, 3, 0, 0, 0]);
  const lanDi = nativeClothBodyCollisionProfile("KOK_M");
  assert.equal(lanDi.sourceAddress, "0x0c282514");
  assert.equal(lanDi.records.length, 14);
  assert.deepEqual(lanDi.records[0], {
    localPosition: [0.17, -0.025, 0.045],
    radius: 0.169,
    controllerType: 20,
    collisionMaskBit: 1 << 9,
  });

  const ineCharacter = nativeClothCharacterProfile("INE_M.CHRM");
  assert.equal(ineCharacter.profileIndex, 59);
  assert.deepEqual(ineCharacter.rawControlBytes, [0, 254, 1, 0, 0, 0, 0, 0]);
  const ine = nativeClothBodyCollisionProfile("INE_M");
  assert.equal(ine.sourceAddress, "0x0c2835a4");
  assert.equal(ine.records.length, 14);
});

test("native runtime modes replace character collision data exactly", () => {
  const normal = nativeClothBodyCollisionProfile("KOK_M", 0);
  const override = nativeClothBodyCollisionProfile("KOK_M", 1);
  assert.equal(normal.sourceAddress, "0x0c282514");
  assert.equal(override.sourceAddress, "0x0c281b78");
  assert.equal(override.records.length, 14);
});

test("native solver damping follows executable profile byte 0x0d", () => {
  assert.equal(NATIVE_CLOTH_SOLVER_PROFILE.fixedFramesPerSecond, 30);
  assert.equal(NATIVE_CLOTH_SOLVER_PROFILE.pinnedAnchorHighNibble, 0x10);
  assert.equal(NATIVE_CLOTH_SOLVER_PROFILE.force.magnitude, 0.05444444715976715);
  assert.equal(NATIVE_CLOTH_SOLVER_PROFILE.positionUpdateFunction, "0x0c0af35e");
  assert.equal(
    NATIVE_CLOTH_SOLVER_PROFILE.surfaceAuxiliaryUpdateFunction,
    "0x0c0b0512",
  );
  assert.deepEqual(nativeClothVelocityDamping("KOK_M"), [0.5, 0.5, 0.5]);
  assert.deepEqual(nativeClothVelocityDamping("YKB_M"), [0.8, 0.65, 0.8]);
  assert.deepEqual(nativeClothVelocityDampingForMode(2), [0.2, 0.1, 0.2]);
  assert.deepEqual(nativeClothVelocityDampingForMode(3), [1, 1, 1]);
});

test("native closed-ring spacing follows profile and runtime mode", () => {
  assert.deepEqual(nativeClothClosedRingConstraintProfile("KOK_M"), {
    spacingSource: "measured",
    spacingScale: 1,
    measuredMaximumBodyRadiusScale: 2,
  });
  assert.deepEqual(nativeClothClosedRingConstraintProfile("KOK_M", 1), {
    spacingSource: "authored",
    spacingScale: 1,
    measuredMaximumBodyRadiusScale: null,
  });
  assert.deepEqual(nativeClothClosedRingConstraintProfile("INE_M"), {
    spacingSource: "measured",
    spacingScale: 1,
    measuredMaximumBodyRadiusScale: 2,
  });
  // Eiko Kusano's 15-frame HPX capture is the regression for keeping profile
  // +0x0a and +0x0d distinct. HPX has +0x0a == 3 but +0x0d == 0; native
  // stores measured ring spacing around 0.187-0.213 m, not authored * 0.3.
  assert.deepEqual(nativeClothClosedRingConstraintProfile("HPX_L"), {
    spacingSource: "measured",
    spacingScale: 1,
    measuredMaximumBodyRadiusScale: 2,
  });
});

test("every cloth-bearing bundled model resolves a complete native profile", () => {
  const inventory = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-native-cloth-models.json",
    "utf8",
  ));
  for (const model of inventory.models) {
    const character = nativeClothCharacterProfile(model.modelCode);
    const collision = nativeClothBodyCollisionProfile(model.modelCode);
    assert.equal(character.rawControlBytes.length, 8);
    assert.ok(collision.records.length >= 2);
  }
  assert.equal(Object.keys(NATIVE_CLOTH_CHARACTER_PROFILES).length, 140);
  assert.equal(Object.keys(NATIVE_CLOTH_BODY_COLLISION_PROFILES).length, 126);
});

test("generated cloth evidence pins constructor, solver, and registry bytes", () => {
  const evidence = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-native-cloth.json",
    "utf8",
  ));
  assert.equal(
    evidence.source.executableSha256,
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c",
  );
  assert.equal(evidence.summary.namedCharacterProfileCount, 140);
  assert.equal(evidence.summary.fallbackProfileCount, 1);
  assert.equal(evidence.summary.uniqueBodyCollisionProfileCount, 121);
  assert.equal(evidence.summary.totalCollisionProfileCount, 126);
  assert.equal(evidence.native.collisionRecord.pointScale, 0.001);
  assert.equal(
    evidence.native.solver.force.fixedDownwardControllerYOffsetLiteralAddress,
    "0x0c0af640",
  );
  assert.equal(evidence.native.solver.closedRingAuthoredSpacingScale, 0.3);
  assert.equal(
    evidence.native.solver.closedRingMeasuredMaximumBodyRadiusScale,
    2,
  );
  assert.equal(evidence.code.clothSolver.byteLength, 4532);
  assert.match(evidence.code.clothSolver.sha256, /^[0-9a-f]{64}$/u);
});
