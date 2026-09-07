import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(
  new URL(relativePath, import.meta.url),
));

const evidence = readJson(
  "../tools/evidence/actor-momt-flag-operation-evidence.json",
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

test("operation 0x0042 retains exact executable provenance", () => {
  const operation = evidence.operation;
  const handler = handlers.handlers.find(
    ({ operationId }) => operationId === operation.operationId,
  );
  assert.equal(handler.operationHex, operation.operationHex);
  assert.equal(handler.handlerAddress, operation.handlerAddress);
  assert.equal(
    handler.handlerSampleSha256,
    operation.handlerSampleSha256,
  );
  assert.equal(operation.momtTagAscii, "MOMT");
  assert.equal(operation.flagSetterAddress, "0x0c113ab0");
});

test("Hato cleanup sets MOMT bit zero on exact actor AKIR", () => {
  const cleanup = hatoFlow.orderedPhases.find(
    ({ phase }) => phase === "cleanup",
  );
  const operation = cleanup.nativeOperations.find(
    ({ callFileOffset }) => (
      callFileOffset === evidence.hatoConversation.callFileOffset
    ),
  );
  assert.equal(operation.operationHex, "0x0042");
  assert.equal(operation.arguments[1].value, 1);
  assert.equal(evidence.hatoConversation.actorCode, "AKIR");
  assert.equal(evidence.hatoConversation.actorLiteralValue, "0x52494b41");
});

test("semantic registry keeps the low-level meaning and explicit boundary", () => {
  const semantic = semantics.operations.find(
    ({ operationId }) => operationId === 66,
  );
  assert.equal(semantic.semanticId, "actor-momt-flag-bit-0");
  assert.match(semantic.provenBehavior, /record \+0x14/);
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /not labelled movement lock/,
  );
});
