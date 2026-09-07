import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/d000-door-callback-table-evidence.json",
  "utf8",
));

test("D000 public exports and generated door target remain distinct", () => {
  assert.equal(evidence.status, "exact");
  assert.equal(evidence.publicExportTable.entryCount, 6);
  assert.deepEqual(evidence.publicExportTable.relativeTargets, [
    "0x00082180",
    "0x00082190",
    "0x000821a0",
    "0x00082220",
    "0x000822a0",
    "0x00082320",
  ]);
  assert.equal(
    evidence.publicExportTable.capturedTableByteExact,
    true,
  );
  assert.equal(evidence.generatedExecutableTargetTable.entryCount, 858);
  assert.equal(
    evidence.generatedExecutableTargetTable.capturedTableByteExact,
    true,
  );
  assert.equal(evidence.doorDispatcher.generatedTargetIndexZeroBased, 570);
  assert.equal(evidence.doorDispatcher.isPublicExport, false);
  assert.equal(evidence.doorDispatcher.relativeTarget, "0x0007707c");
  assert.equal(evidence.doorDispatcher.targetFileOffset, "0x000783b4");
});
