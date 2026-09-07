import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/global-byte-state-operation-evidence.json",
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

test("operation 0x00ac retains the exact global-byte write", () => {
  assert.equal(evidence.operation.operationHex, "0x00ac");
  assert.equal(evidence.operation.destinationAddress, "0x0c225340");
  assert.equal(evidence.operation.destinationWidth, "byte");
  assert.equal(evidence.hatoConversation.callFileOffset, "0x80100");
  assert.equal(evidence.hatoConversation.value, 1);
});

test("semantic registry exposes only the proven low-level behavior", () => {
  const semantic = semantics.operations.find(
    (operation) => operation.operationId === 172,
  );
  assert.equal(semantic.semanticId, "global-byte-state-write");
  assert.match(semantic.provenBehavior, /0x0c225340/);
});
