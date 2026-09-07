import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(
  new URL(relativePath, import.meta.url),
));

const evidence = readJson(
  "../tools/evidence/camera-state-mode-operation-evidence.json",
);
const handlers = readJson(
  "../tools/evidence/d000-operation-handlers.json",
);
const semantics = readJson(
  "../tools/evidence/native-operation-semantics.json",
);

test("operation 0x000e retains exact camera handler provenance", () => {
  const operation = evidence.operation;
  const handler = handlers.handlers.find(
    ({ operationId }) => operationId === operation.operationId,
  );
  assert.equal(handler.handlerAddress, operation.handlerAddress);
  assert.equal(
    handler.handlerSampleSha256,
    operation.handlerSampleSha256,
  );
  assert.equal(
    operation.cameraStateModeSelectorAddress,
    "0x0c09f4c6",
  );
});

test("Hato cleanup retains numeric camera mode without guessing a label", () => {
  assert.equal(evidence.hatoConversation.callFileOffset, "0x80110");
  assert.equal(evidence.hatoConversation.requestedMode, 0);
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /numeric modes are not assigned invented names/,
  );
});

test("event IR has an exact camera-state mode adapter", () => {
  const semantic = semantics.operations.find(
    ({ operationId }) => operationId === 14,
  );
  assert.equal(semantic.semanticId, "camera-state-mode-select");
  assert.match(semantic.provenBehavior, /shared camera-state mode selector/);
});
