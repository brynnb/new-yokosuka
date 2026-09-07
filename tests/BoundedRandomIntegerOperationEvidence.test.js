import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/bounded-random-integer-operation-evidence.json",
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

test("operation 0x004f mode 6 retains its exact bounded-random contract", () => {
  assert.equal(evidence.operation.operationHex, "0x004f");
  assert.equal(evidence.operation.mode, 6);
  assert.equal(evidence.allDiscInventory.callCount, 248);
  assert.equal(evidence.operation.sharedRandomFunction, "0x0c1ce210");
});

test("operation 0x004f mode 4 truncates a native float toward zero", () => {
  assert.equal(evidence.floatToIntegerTruncation.mode, 4);
  assert.equal(evidence.modeFourAllDiscInventory.callCount, 804);
  assert.match(
    evidence.floatToIntegerTruncation.provenBehavior,
    /toward zero/,
  );
});

test("operation 0x004f mode 5 retains its exact binary-angle contract", () => {
  assert.equal(evidence.binaryAngleFromFloatPair.mode, 5);
  assert.equal(evidence.modeFiveAllDiscInventory.callCount, 300);
  assert.equal(
    evidence.binaryAngleFromFloatPair.verifiedHelpers.binaryAngleFloatPair.address,
    "0x0c0915e0",
  );
  assert.match(
    evidence.binaryAngleFromFloatPair.provenBehavior,
    /quadrant paths/,
  );
});

test("semantic registry constrains all three proven numeric modes", () => {
  const operationSemantics = semantics.operations.filter(
    operation => operation.operationId === 79,
  );
  assert.deepEqual(
    operationSemantics.map(operation => operation.semanticId),
    [
      "float-to-integer-truncation",
      "binary-angle-from-float-pair",
      "bounded-random-integer",
    ],
  );
  assert.deepEqual(operationSemantics[0].argumentConstraints, [{
    index: 0,
    values: [4],
  }]);
  assert.equal(operationSemantics[1].argumentCount, 3);
  assert.deepEqual(operationSemantics[1].argumentConstraints, [{
    index: 0,
    values: [5],
  }]);
  assert.deepEqual(operationSemantics[2].argumentConstraints, [{
    index: 0,
    values: [6],
  }]);
});
