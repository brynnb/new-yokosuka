import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(
  new URL(relativePath, import.meta.url),
));

const evidence = readJson(
  "../tools/evidence/resolved-object-vector-operation-evidence.json",
);
const handlers = readJson(
  "../tools/evidence/d000-operation-handlers.json",
);
const semantics = readJson(
  "../tools/evidence/native-operation-semantics.json",
);

test("operation 0x001d retains exact executable provenance", () => {
  const operation = evidence.operation;
  const handler = handlers.handlers.find(
    ({ operationId }) => operationId === operation.operationId,
  );
  assert.equal(handler.handlerAddress, operation.handlerAddress);
  assert.equal(
    handler.handlerSampleSha256,
    operation.handlerSampleSha256,
  );
  assert.deepEqual(
    operation.normalVectorPath.directVectorOffsets,
    ["+0x14", "+0x18", "+0x1c"],
  );
});

test("Hato postlude applies exact vector operation to AKIR", () => {
  const hato = evidence.hatoConversation;
  assert.equal(hato.callFileOffset, "0x7fc18");
  assert.equal(hato.actorCode, "AKIR");
  assert.equal(hato.flags, "0x78000000");
  assert.equal(hato.vectorSource.offset, "0x00ec");
  assert.match(hato.flagsMeaning, /replace all three components/);
});

test("event IR promotes only the neutral resolved-vector semantic", () => {
  const semantic = semantics.operations.find(
    ({ operationId }) => operationId === 29,
  );
  assert.equal(semantic.semanticId, "resolved-object-vector-operation");
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /coordinate-space names.*remain deliberately unnamed/,
  );
});
