import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  "tools/evidence/operation-0005-evidence.json",
  "utf8",
));
const semantics = JSON.parse(readFileSync(
  "tools/evidence/native-operation-semantics.json",
  "utf8",
));

test("operation 0x0005 installs the exact resolved current presentation owner", () => {
  assert.equal(evidence.operation.objectResolver, "0x0c153956");
  assert.equal(evidence.operation.primaryRuntimeReset, "0x0c0a6a06");
  assert.equal(evidence.operation.currentOwnerInstaller, "0x0c0f0cd8");
  assert.equal(evidence.operation.notificationTag, "CPCT");
  assert.equal(evidence.inventory.authoredCallCount, 138);
  assert.deepEqual(evidence.inventory.op02Calls.map(value => value.callFileOffset), [
    "0x2410",
  ]);
  const semantic = semantics.operations.find(value => (
    value.operationHex === "0x0005" && value.argumentCount === 1
  ));
  assert.equal(semantic.semanticId, "current-presentation-owner-install");
});
