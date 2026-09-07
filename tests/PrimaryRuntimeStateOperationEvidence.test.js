import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/primary-runtime-state-operation-evidence.json",
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

test("operation 0x002d proven modes retain exact native targets and Hato calls", () => {
  assert.equal(evidence.operation.operationHex, "0x002d");
  assert.deepEqual(
    evidence.operation.provenModes.map((mode) => mode.mode),
    [0, 1, 2, 8, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(evidence.operation.provenModes[0].targetAddress, "0x0c0a6a06");
  assert.equal(evidence.operation.provenModes[1].targetAddress, "0x0c0a69f2");
  assert.equal(evidence.operation.provenModes[2].targetAddress, "0x0c0a6a80");
  assert.equal(evidence.operation.provenModes[3].targetAddress, "0x0c0a954a");
  assert.equal(evidence.allDiscInventory.authoredCallCount, 2150);
  assert.equal(evidence.allDiscInventory.provenCallCount, 2150);
  assert.equal(evidence.allDiscInventory.unresolvedDialogueRegionCallCount, 0);
  assert.equal(
    evidence.operation.extendedNativeContract.mode16,
    "0x0c13ef58",
  );
  assert.equal(evidence.hatoConversation.prelude.callFileOffset, "0x7f8be");
  assert.equal(
    evidence.hatoConversation.controlCleanup.callFileOffset,
    "0x80148",
  );
});

test("semantic registry constrains all authored primary runtime modes", () => {
  const recovered = semantics.operations.filter(
    (operation) => operation.operationId === 45,
  );
  assert.deepEqual(recovered.slice(0, 3).map(
    semantic => semantic.semanticId
  ), [
    "primary-runtime-state-transition",
    "primary-runtime-state-one-query",
    "primary-runtime-status-byte-query",
  ]);
  assert.ok(recovered.slice(3).every(
    semantic => semantic.semanticId === "primary-runtime-extended-operation"
  ));
  assert.deepEqual(
    recovered.map((semantic) => semantic.argumentConstraints[0].values),
    [
      [0, 1], [2], [8], [7], [9], [11], [12],
      [13], [14], [15], [16], [17], [18],
    ],
  );
  assert.deepEqual(
    recovered.map((semantic) => semantic.argumentCount),
    [1, 1, 1, 2, 2, 1, 2, 2, 3, 1, 2, 2, 1],
  );
});
