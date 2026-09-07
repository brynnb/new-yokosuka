import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-interaction-registration.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("ordinary interaction registration is exact across the recovered corpus", () => {
  assert.equal(evidence.summary.mapinfoCount, 136);
  assert.equal(evidence.summary.candidateSetupFunctionCount, 96);
  assert.equal(evidence.summary.registrationCount, 96);
  assert.equal(evidence.summary.exactRegistrationCount, 96);
  assert.equal(evidence.summary.gapCount, 0);
  assert.equal(evidence.summary.internalSlotCount, 10);
  assert.deepEqual(evidence.summary.ownerTagCounts, { AKIR: 96 });
});

test("Disc 1 Dobuita preserves exact static inputs and scene bindings", () => {
  const [anchor] = evidence.verifiedAnchors;
  assert.equal(anchor.disc, 1);
  assert.equal(anchor.area, "D000");
  assert.equal(anchor.ownerTag, "AKIR");
  assert.equal(anchor.setupFunction, "0x27d80");
  assert.equal(anchor.callFileOffset, "0x8da02");
  assert.deepEqual(
    anchor.sceneBindings.map((binding) => [
      binding.callerArgument,
      binding.sceneFieldOffsetHex,
    ]),
    [
      [1, "0x144"],
      [2, "0x148"],
      [3, "0x14c"],
      [4, "0x150"],
      [0, "0x2a4"],
    ],
  );
  assert.deepEqual(
    anchor.staticInputs.map((entry) => entry.fileOffset),
    ["0xa776c", "0xa84d4", "0xa88fc", "0xa8b3c"],
  );
  assert.deepEqual(
    anchor.staticInputs[0].provenSetupRead.probes.map(
      (probe) => probe.value,
    ),
    [0, 3, 6, 8, 11, 14, 17, 20, 23, 26],
  );
});

test("the varying fifth caller argument is not mislabeled as slot count", () => {
  assert.deepEqual(evidence.summary.controlArgument5Counts, {
    1: 32,
    10: 30,
    15: 3,
    2: 18,
    3: 7,
    4: 3,
    5: 3,
  });
  assert.ok(
    evidence.coverage.every(
      (entry) => entry.internalSlotCount === 10,
    ),
  );
});
