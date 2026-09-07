import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidenceUrl = new URL(
  "../tools/evidence/dialogue-progress-state.json",
  import.meta.url,
);

test("native conversation progress evidence remains exact", async () => {
  const report = JSON.parse(await readFile(evidenceUrl, "utf8"));
  assert.equal(report.nativeTable.recordCount, 325);
  assert.equal(report.nativeTable.recordSize, 12);
  assert.equal(report.nativeTable.byteLength, 3900);
  const metric = report.nativeTable.fields.at(-1);
  assert.equal(metric.type, "little-endian float32");
  assert.equal(metric.initialValue, 9);
  assert.equal(metric.initialBits, "0x41100000");
  assert.equal(report.nativeIdentityIndex.fixedIndexCount, 301);
  assert.equal(report.nativeIdentityIndex.namedIdentityCount, 277);
  assert.equal(report.nativeIdentityIndex.dynamicIndexStart, 301);
  assert.equal(report.nativeIdentityIndex.dynamicIndexCount, 24);
  assert.equal(report.nativeIdentityIndex.dynamicCursorInitialValue, 23);
  assert.equal(
    report.nativeIdentityIndex.dynamicIdentityInitialValue,
    "0xffffffff",
  );
  assert.match(report.nativeIdentityIndex.zeroIndexBehavior, /AKIR/);
  assert.deepEqual(report.nativeIdentityIndex.entries[30], {
    index: 30,
    identity: "HATO",
  });

  const f2 = report.verifiedResumeRules.find(
    (rule) => rule.instruction === "F2",
  );
  assert.equal(f2.yieldState, 5);
  assert.equal(f2.effectiveStructuralContinuation, "opcode + 4");
  assert.match(f2.completion.deferredGuard, /bit 0.*bit 6/);
  assert.match(f2.completion.operand, /signed 24-bit/);
  assert.match(f2.completion.nonzeroDisplacement, /\+0x5c/);

  const f9 = report.verifiedResumeRules.find(
    (rule) => rule.instruction === "F9",
  );
  assert.match(f9.staticLimit, /explicitly dynamic/);
});
