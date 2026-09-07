import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-native-interaction-manager.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("native interaction callback path resolves selector zero exactly", () => {
  assert.deepEqual(
    evidence.callbackPath.map((step) => step.runtimeAddress),
    ["0x0c0bb6be", "0x0c160918", "0x0c15dbcc"],
  );
  assert.equal(
    evidence.source.selectorDispatchTableAddress,
    "0xc281278",
  );
  assert.deepEqual(
    evidence.source.selectorDispatchEntries.slice(0, 6),
    [
      { selector: 0, runtimeAddress: "0xc15dbcc" },
      { selector: 1, runtimeAddress: "0xc15dd4c" },
      { selector: 2, runtimeAddress: "0xc15dce8" },
      { selector: 3, runtimeAddress: "0xc15f388" },
      { selector: 4, runtimeAddress: "0xc15f3c4" },
      { selector: 5, runtimeAddress: "0xc15f3e8" },
    ],
  );
});

test("native descriptor tables are exact across all registrations", () => {
  assert.equal(evidence.summary.registrationCount, 96);
  assert.equal(evidence.summary.exactDescriptorTableCount, 96);
  assert.equal(evidence.summary.gapCount, 0);
  assert.equal(evidence.summary.descriptorRecordCount, 517);
  assert.equal(evidence.summary.minimumDescriptorCount, 1);
  assert.equal(evidence.summary.maximumDescriptorCount, 65);
  assert.equal(evidence.summary.runtimeSlotCountPerManager, 16);
  assert.equal(evidence.summary.hardCandidateCapacity, 10);
  assert.equal(evidence.summary.indirectReferenceCount, 850);
  assert.equal(evidence.summary.referencedIndirectRecordCount, 847);
  assert.deepEqual(evidence.summary.indirectRecordTypeHistogram, {
    1: 330,
    2: 517,
  });
});

test("Disc 1 Dobuita has 65 exact descriptors and native count clamps", () => {
  const [anchor] = evidence.verifiedAnchors;
  assert.equal(anchor.disc, 1);
  assert.equal(anchor.area, "D000");
  assert.equal(anchor.descriptorTable.recordSizeBytes, 52);
  assert.equal(anchor.descriptorTable.wordCountPerRecord, 13);
  assert.equal(anchor.descriptorTable.recordCount, 65);
  assert.equal(anchor.descriptorTable.fileOffset, "0xa776c");
  assert.equal(anchor.descriptorTable.sentinelFileOffset, "0xa84a0");
  assert.deepEqual(anchor.nativeDerivedCounts, {
    descriptorCountStoredAtManagerPlus44: 65,
    controlLimitStoredAtManagerPlus64: 10,
    candidateCapacityStoredAtManagerPlus72: 10,
  });
  assert.equal(anchor.indirectIndexTable.referenceCount, 120);
  assert.deepEqual(anchor.indirectRecordTable.typeHistogram, {
    1: 55,
    2: 65,
  });
});

test("manager layout preserves separate runtime slots and candidate scratch", () => {
  assert.deepEqual(evidence.managerLayout.candidateScratch, {
    offset: "0x4c",
    recordCount: 10,
    recordSizeBytes: 20,
  });
  assert.deepEqual(evidence.managerLayout.runtimeSlots, {
    offset: "0x114",
    recordCount: 16,
    recordSizeBytes: 24,
    initialWords: [0, 0, 0xffffffff, 0xfffffffd, 0, 5],
  });
});
