import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("play/data/native-map-transitions.json", "utf8"),
);

test("browser transitions retain native Dobuita selectors and exact entries", () => {
  assert.equal(report.schema, "new-yokosuka-native-map-transitions-v2");
  assert.deepEqual(report.summary, {
    d000DirectTransitionCount: 18,
    d000SupportedFreeRoamTransitionCount: 12,
    d000NativeNonFreeRoamTransitionCount: 6,
    exactInteriorReturnTransitionCount: 12,
    interiorReturnWithExactDestinationPlacementCount: 12,
    interiorReturnWithResolvedDoorModelCount: 12,
    interiorReturnWithResolvedInteractionVolumeCount: 0,
    canonicalExactDoorTransitionCount: 25,
    canonicalExactDoorWithEntryPlacementCount: 25,
    canonicalExactDoorWithResolvedModelCount: 25,
    reverseMatchedD000TransitionCount: 22,
    reverseMatchedD000DerivedSpawnCount: 10,
    nativeVolumeTransitionCount: 25,
    runtimeDisc1NativeVolumeTransitionCount: 8,
    runtimeDisc1NativeVolumeWithEntryPlacementCount: 7,
  });

  const ajiichi = report.d000DirectTransitions.find(
    (item) => item.source.dispatchValue === 30,
  );
  assert.equal(ajiichi.destination.area, "DCHA");
  assert.deepEqual(ajiichi.destination.browserSpawn.position, [
    0.10999999940395355,
    0,
    -2.9600000381469727,
  ]);
  assert.equal(ajiichi.destination.browserSpawn.yawDegrees, -180);

  const soba = report.d000DirectTransitions.find(
    (item) => item.source.dispatchValue === 34,
  );
  assert.equal(soba.destination.area, "DSBA");
  assert.equal(soba.destination.browserSpawn, null);
  assert.equal(soba.supported, false);
  assert.match(soba.unsupportedReason, /no requested player Entry/);
});

test("reverse D000 entries identify physical storefront doors", () => {
  const byArea = new Map(
    report.reverseMatchedD000Transitions.map((transition) => [
      transition.destination.area,
      transition,
    ]),
  );
  assert.equal(byArea.get("DBYO").source.doorSelector, 63);
  assert.equal(byArea.get("DJAZ").source.doorSelector, 0);
  assert.equal(byArea.get("DGCT").source.doorSelector, 64);
  assert.deepEqual(byArea.get("DGCT").destination.browserSpawn.position, [
    -2.700000047683716,
    0,
    -0.846999999973923,
  ]);
  assert.equal(
    byArea.get("DGCT").destination.browserSpawn.yawDegrees,
    0,
  );
  assert.equal(
    byArea.get("DBYO").destination.browserSpawn.yawDegrees,
    180,
  );
});

test("all exact typed door routes are canonicalized across disc variants", () => {
  assert.equal(report.allExactDoorTransitions.length, 25);
  assert.equal(
    new Set(report.allExactDoorTransitions.map((item) => item.id)).size,
    25,
  );
  for (const transition of report.allExactDoorTransitions) {
    assert.equal(transition.supported, true);
    assert.ok(transition.source.model);
    assert.ok(transition.destination.browserSpawn);
    assert.equal(
      transition.evidence.transitionAssociation,
      "exactSingleOutgoingDestination",
    );
  }

  const arcade = report.allExactDoorTransitions.find(
    (item) => item.source.area === "DGCT",
  );
  assert.equal(arcade.source.objectTag, "AUTO_DOOR");
  assert.equal(arcade.source.model, "S1_DGCT_DR17_003.MT5");
  assert.equal(arcade.destination.area, "D000");
  assert.equal(arcade.destination.entry, 6);

  const harborOffice = report.allExactDoorTransitions.find(
    (item) => item.source.area === "MKYU",
  );
  assert.equal(harborOffice.source.model, "S2_MKYU_DR02_001.MT5");
  assert.equal(harborOffice.destination.area, "MFSY");
  assert.equal(harborOffice.destination.entry, 19);
});

test("interior returns use native controller roots and D000 Entry placement", () => {
  assert.equal(report.interiorReturnTransitions.length, 12);
  const antique = report.interiorReturnTransitions.find(
    (item) => item.source.area === "DKTY",
  );
  assert.equal(antique.source.model, "S1_DKTY_DR15-017.MT5");
  assert.deepEqual(antique.source.nativeDoorObject.position, [
    -2.700000047683716,
    0,
    -0.03999999910593033,
  ]);
  assert.equal(antique.destination.worldId, "dobuita");
  assert.equal(antique.destination.entry, 7);
  assert.deepEqual(antique.destination.browserSpawn.position, [
    56.90999984741211,
    0.07240000367164612,
    44.630001068115234,
  ]);
  assert.ok(Math.abs(
    antique.destination.browserSpawn.yawDegrees - -36.57000732421875,
  ) < 1e-9);

  const nagai = report.interiorReturnTransitions.find(
    (item) => item.source.area === "DYKZ",
  );
  assert.equal(nagai.source.model, "S1_DYKZ_DR02_024.MT5");
  assert.equal(nagai.supported, true);
  assert.equal(
    nagai.source.nativeDoorObject.modelResolution,
    "exactChrtDefImageBinding",
  );
  assert.deepEqual(
    nagai.source.nativeDoorObject.chrtDefImageBinding,
    {
      model: "DR02_024.MT5",
      recordOffset: "0x28",
      archive: "extracted_files/data/SCENE/01/DYKZ/MPK00.PKF",
    },
  );
  assert.deepEqual(nagai.source.nativeDoorObject.modelCandidates, [
    "S1_DYKZ_DR02_020.MT5",
    "S1_DYKZ_DR02_024.MT5",
  ]);
});
