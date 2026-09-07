import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  "tools/evidence/scn3-container-encoding-evidence.json",
));

test("SCN3 corpus distinguishes native and legacy executable encodings", () => {
  assert.equal(
    report.schema,
    "new-yokosuka-scn3-container-encoding-evidence-v1",
  );
  assert.equal(report.summary.mapinfoCount, 136);
  assert.deepEqual(report.summary.classificationCounts, {
    "legacy-instruction-stream-scn3-program": 17,
    "native-sh4-scn3-program": 119,
  });
  assert.equal(report.summary.assetOnlyCount, 0);
  assert.equal(report.summary.nestedContainerCount, 0);
  assert.equal(report.summary.multipleTopLevelContainerCount, 0);
  assert.equal(report.summary.nativeExtractionAnomalyCount, 0);
});

test("legacy records retain exact nonempty token and entry evidence", () => {
  assert.equal(report.legacyInstructionStreamPrograms.length, 17);
  assert.ok(report.legacyInstructionStreamPrograms.every(record => (
    record.classification === "legacy-instruction-stream-scn3-program"
    && record.encodingMarker === "0x00000100"
    && record.encodingDiscriminatorByte === 0
    && record.scn3TokenCount === 1
    && record.boundsValid === true
    && record.programByteLength > 0
    && record.entryBytes.length > 0
    && record.generatedNativeThunk === false
    && record.generatedNativeEntryPrologue === false
    && record.nativeControlFlowFunctionCount === 0
    && record.nestedScn3FileOffsets.length === 0
  )));
});

test("original loader proves a distinct zero-discriminator program path", () => {
  assert.deepEqual(report.nativeLoader.programLoader.headerBindings, {
    entryTarget: "token base + uint32 at token +0x0c",
    staticData: "token base + uint32 at token +0x10",
    runtimeData: "token base + uint32 at token +0x20",
  });
  assert.deepEqual(report.nativeLoader.discriminator, {
    loadAddress: "0x0c0bb1fe",
    tokenByteOffset: "0x0a",
    loadTestBranchBytes: "c153d3643a8408202b8d",
    zeroBranchTarget: "0x0c0bb260",
    nonzeroPathAddress: "0x0c0bb208",
    zeroPathAddress: "0x0c0bb260",
    provenBehavior: (
      "load SCN3 token byte +0x0a, test it, and branch to a distinct "
      + "scenario-context construction path when it is zero"
    ),
  });
});
