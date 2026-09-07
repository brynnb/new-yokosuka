import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL("../tools/evidence/actor-lnwk-operation-evidence.json", import.meta.url),
    "utf8",
  ),
);
const semantics = JSON.parse(
  fs.readFileSync(
    new URL("../tools/evidence/native-operation-semantics.json", import.meta.url),
    "utf8",
  ),
);

test("operation 0x004c retains the native LNWK command family", () => {
  assert.equal(evidence.operation.operationHex, "0x004c");
  assert.equal(evidence.operation.associatedRecordTag, "LNWK");
  assert.deepEqual(
    evidence.operation.commands.map((item) => item.command),
    [0, 1, 2, 3, 4],
  );
});

test("semantic registry uses the native record-family name", () => {
  const semantic = semantics.operations.find(
    (operation) => operation.operationId === 76,
  );
  assert.equal(semantic.semanticId, "actor-lnwk-control");
  assert.match(semantic.provenBehavior, /LNWK/);
});
