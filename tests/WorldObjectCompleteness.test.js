import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidencePath = "tools/evidence/world-object-completeness.json";

test("world completeness gate includes absent-source and operation gaps", {
  skip: !fs.existsSync(evidencePath),
}, () => {
  const report = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(report.worlds.interior.status, "verified");
  assert.equal(report.worlds.exterior.status, "verified");
  assert.equal(report.worlds.dobuita.status, "incomplete");
  assert.deepEqual(
    report.worlds.interior.evidence.missingStaticDoorIndices,
    [],
  );
  assert.equal(
    report.worlds.interior.evidence.entranceDoor.model,
    "S1_JOMO_DR15_016.MT5",
  );
  assert.deepEqual(
    report.worlds.interior.evidence.entranceDoor.position,
    [-14.886, -0.219, 6.3261],
  );
  assert.equal(report.worlds.exterior.evidence.nativeArea, "JHD0");
  assert.equal(report.worlds.exterior.evidence.finalPlacements, 34);
  assert.equal(report.worlds.exterior.evidence.instantiatedPlacements, 34);
  assert.deepEqual(
    report.worlds.dobuita.evidence.omittedDynamicTags,
    [],
  );
  assert.ok(report.worlds.dobuita.evidence.unresolvedPlacedObjects > 0);
  assert.equal(
    report.worlds.dobuita.evidence.tkoStateMachine.storySelectorCount,
    2,
  );
  assert.equal(
    report.worlds.dobuita.evidence.tkoStateMachine.clockWindow.boundary,
    "start-inclusive, end-exclusive",
  );
  assert.deepEqual(
    report.worlds.dobuita.evidence.phoneBookInteraction,
    {
      status: "verified",
      attachments: ["closed", "opened"],
    },
  );
  assert.equal(report.worlds.yamanose.status, "verified");
  assert.ok(
    report.worlds.yamanose.evidence.scheduledActorsWithJu00Routes.length >= 6,
  );
  assert.equal(report.worlds.sakuragaoka.status, "verified");
  assert.equal(
    report.worlds.sakuragaoka.evidence.staticDoorRecordCount,
    55,
  );
  assert.deepEqual(
    report.worlds.sakuragaoka.evidence.capturedRuntimeObjectTags.sort(),
    ["BTEL", "DAMY", "GCH1", "GCH2", "TBOX", "VMG0", "VM_0"],
  );
  for (const world of [
    "arcade",
    "harbor",
    "warehouseDistrict",
    "warehouseEight",
    "forkliftRace",
    "forkliftPlayground",
  ]) {
    assert.equal(report.worlds[world].status, "verified", world);
  }
});
