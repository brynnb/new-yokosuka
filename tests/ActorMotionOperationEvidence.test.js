import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(
  new URL(relativePath, import.meta.url),
));

const evidence = readJson(
  "../tools/evidence/actor-motion-operation-evidence.json",
);
const handlers = readJson(
  "../tools/evidence/d000-operation-handlers.json",
);
const hatoFlow = readJson(
  "../tools/evidence/d000-hato-conversation-flow.json",
);
const semantics = readJson(
  "../tools/evidence/native-operation-semantics.json",
);

test("actor motion operations retain exact executable handler provenance", () => {
  for (const operation of [
    evidence.motionRequestOperation,
    evidence.motionStatusOperation,
  ]) {
    const handler = handlers.handlers.find(
      ({ operationId }) => operationId === operation.operationId,
    );
    assert.equal(handler.operationHex, operation.operationHex);
    assert.equal(handler.handlerAddress, operation.handlerAddress);
    assert.equal(
      handler.handlerSampleSha256,
      operation.handlerSampleSha256,
    );
  }
});

test("Hato motion examples are exact native calls from the four-phase flow", () => {
  const operations = hatoFlow.orderedPhases.flatMap(
    ({ phase, nativeOperations }) => nativeOperations.map(
      (operation) => ({ phase, ...operation }),
    ),
  );
  for (const example of evidence.hatoConversationExamples) {
    const operation = operations.find(
      ({ callFileOffset }) => callFileOffset === example.callFileOffset,
    );
    assert.ok(operation, `missing operation at ${example.callFileOffset}`);
    if (example.motionRequest !== undefined) {
      assert.equal(operation.operationHex, "0x0028");
      assert.equal(operation.arguments[1].value, example.motionRequest);
      assert.equal(example.motionIndex, example.motionRequest - 1);
      assert.equal(example.actorCode, "AKIR");
    } else {
      assert.equal(operation.operationHex, example.operationHex);
      assert.equal(example.actorCode, "AKIR");
    }
  }
});

test("event IR exposes only the proven low-level motion behavior", () => {
  const byOperation = new Map(
    semantics.operations.map((operation) => [
      operation.operationId,
      operation,
    ]),
  );
  assert.equal(byOperation.get(40).semanticId, "actor-motion-request");
  assert.equal(
    byOperation.get(41).semanticId,
    "actor-motion-status-bit-1-query",
  );
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /exactly resolves all three runtime-looking actor loads to AKIR/,
  );
});
