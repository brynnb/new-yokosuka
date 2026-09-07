import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(
  new URL(relativePath, import.meta.url),
));

const evidence = readJson(
  "../tools/evidence/event-camera-operation-evidence.json",
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

test("event-camera operations retain exact executable provenance", () => {
  for (const operation of [
    evidence.randomFloatOperation,
    evidence.cameraRequestOperation,
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
  assert.equal(
    evidence.cameraRequestOperation.requestRecord.selectedMode,
    6,
  );
});

test("Hato selects exactly one of its three authored camera numbers", () => {
  const operations = hatoFlow.orderedPhases.flatMap(
    ({ nativeOperations }) => nativeOperations,
  );
  const random = operations.find(
    ({ callFileOffset }) => (
      callFileOffset === evidence.hatoConversation.randomCallFileOffset
    ),
  );
  const request = operations.find(
    ({ callFileOffset }) => (
      callFileOffset === evidence.hatoConversation.requestCallFileOffset
    ),
  );
  assert.equal(random.operationHex, "0x0009");
  assert.equal(random.arguments[0].value, 16);
  assert.equal(random.arguments[1].value, 0x40400000);
  assert.equal(request.operationHex, "0x0011");
  assert.deepEqual(
    request.arguments.slice(1).map(({ value }) => value),
    [0, 0],
  );
  assert.deepEqual(
    evidence.hatoConversation.possibleCameraNumbers,
    [2950, 2952, 2954],
  );
});

test("event IR labels only proven camera and numeric modes", () => {
  const operationNine = semantics.operations.filter(
    operation => operation.operationId === 9,
  );
  const scaledRandom = operationNine.find(
    operation => operation.semanticId === "scaled-uniform-random-float",
  );
  assert.ok(scaledRandom);
  assert.deepEqual(
    scaledRandom.argumentConstraints[0].values,
    [16],
  );
  assert.equal(
    semantics.operations.find(
      operation => operation.operationId === 17,
    ).semanticId,
    "event-camera-request",
  );
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /must not replace these authored camera numbers with guessed/,
  );
});
