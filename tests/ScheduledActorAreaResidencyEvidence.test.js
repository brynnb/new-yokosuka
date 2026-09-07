import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-area-residency-evidence.json",
  "utf8",
));

test("operation 0x08 is an exact linked-actor same-area residency gate", () => {
  assert.ok(evidence.summary.operationCount > 0);
  assert.ok(evidence.summary.actorCodeCount > 0);
  assert.ok(Object.keys(evidence.summary.areaCodeCounts).length > 1);
  assert.equal(evidence.nativeEvidence.handlerAddress, "0x0c1195d8");
  assert.equal(evidence.nativeEvidence.actorAreaCodeOffset, "0x0c");
  assert.equal(evidence.nativeEvidence.actorPositionOffset, "0x24");
  assert.equal(evidence.nativeEvidence.linkedActorPointerOffset, "0x7c");
  assert.equal(
    evidence.nativeEvidence.residentActorLookupAddress,
    "0x0c11bf5c",
  );
  assert.equal(evidence.nativeEvidence.actorRecordStride, 0x1f0);
  assert.match(evidence.evidenceBoundary, /require the owner and target/);
  assert.match(evidence.evidenceBoundary, /same-area residency/);
  assert.ok(evidence.operations.every((operation) => (
    typeof operation.areaCode === "string" && operation.areaCode.length === 4
  )));
});
