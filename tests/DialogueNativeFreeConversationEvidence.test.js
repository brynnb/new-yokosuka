import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-native-free-conversation.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const semantics = JSON.parse(
  fs.readFileSync(
    new URL("../tools/evidence/native-operation-semantics.json", import.meta.url),
    "utf8",
  ),
);

test("free-conversation evidence identifies the native manager exactly", () => {
  assert.equal(evidence.operation.operationHex, "0x0051");
  assert.equal(evidence.operation.handlerAddress, "0xc1592e0");
  assert.equal(evidence.managerSchema.runtimePersonRecordSize, 0x78);
  assert.equal(evidence.managerSchema.roomPersonCapacity, 12);
  assert.equal(evidence.managerSchema.dynamicPersonCapacity, 24);
  assert.equal(evidence.summary.mapinfoCount, 136);
  assert.equal(evidence.summary.operationCallCount, 7554);
  assert.equal(evidence.summary.constantSuboperationCounts["11"], 4334);
  assert.equal(evidence.summary.constantSuboperationCounts.runtime, 3);
  const operation = semantics.operations.find(
    ({ operationHex }) => operationHex === "0x0051",
  );
  assert.equal(operation.semanticId, "native-free-conversation-control");
});

test("free-conversation evidence does not conflate door interactions", () => {
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /distinct from the general spatial door\/object interaction manager/,
  );
  const initialize = evidence.operation.suboperations.find(
    ({ suboperation }) => suboperation === 1,
  );
  assert.match(initialize.description, /authored person records/);
});
