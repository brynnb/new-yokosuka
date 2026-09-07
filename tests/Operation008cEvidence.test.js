import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  new URL("../tools/evidence/operation-008c-evidence.json", import.meta.url),
  "utf8",
));

test("operation 0x008c evidence pins the IMGM selection byte contract", () => {
  assert.equal(evidence.operation.operationHex, "0x008c");
  assert.equal(evidence.operation.componentTag, "IMGM");
  assert.equal(evidence.operation.selectionByteOffset, 9);
  assert.equal(evidence.operation.argumentValueBehavior, "truncate to low byte");
  assert.deepEqual(evidence.operation.nativeContract, {
    handlerTableEntry: "0x0c164ffe",
    objectResolver: "0x0c153956",
    imgmSelectionWriter: "0x0c0e3434",
    imgmComponentTag: "0x4d474d49",
    componentResolver: "0x0c0aad5a",
  });
});

test("operation 0x008c evidence retains the full-corpus inventory", () => {
  assert.equal(evidence.allDiscInventory.authoredCallCount, 41);
  assert.equal(evidence.allDiscInventory.argumentCount, 2);
  assert.deepEqual(evidence.allDiscInventory.argumentKindCounts, {
    0: { constant: 41 },
    1: { "frame-field": 11, runtime: 30 },
  });
  assert.deepEqual(
    evidence.allDiscInventory.op00CallFileOffsets,
    ["0x818", "0x836", "0x854", "0x872"],
  );
  assert.equal(evidence.allDiscInventory.resultComparisonCount, 0);
  assert.equal(evidence.allDiscInventory.resultTargetCount, 0);
});
