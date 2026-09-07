import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(
  new URL(relativePath, import.meta.url),
));

const evidence = readJson(
  "../tools/evidence/actor-look-point-operation-evidence.json",
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

test("actor look-point operation retains exact executable provenance", () => {
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
  assert.equal(operation.targetRecord.tagAscii, "LKPT");
  assert.equal(operation.targetRecord.recordSize, 24);
  assert.equal(operation.targetRecord.recordType, 6);
  assert.equal(operation.selectorMap.runtimeAddress, "0x0c29a400");
  assert.equal(operation.selectorMap.executableFileOffset, "0x28a400");
  assert.equal(operation.selectorMap.entryWidth, 4);
  assert.equal(operation.selectorMap.entryCount, 22);
  assert.equal(
    operation.selectorMap.sampleSha256,
    "b1d4de3c69304735a6d2a18c8bb841de4a74fdbcebfdd4eeb33706f1af1ad0ee",
  );
  assert.equal(operation.selectorMap.values[15], "0x8066");
  assert.equal(operation.selectorMap.values[16], "0x8068");
});

test("Hato installs and later releases the exact native look point", () => {
  const phaseOperations = hatoFlow.orderedPhases.flatMap(
    ({ nativeOperations }) => nativeOperations,
  );
  const install = phaseOperations.find(
    ({ callFileOffset }) => (
      callFileOffset === evidence.hatoConversation.installCallFileOffset
    ),
  );
  const release = hatoFlow.controlRoutine.nativeOperations.find(
    ({ callFileOffset }) => (
      callFileOffset === evidence.hatoConversation.releaseCallFileOffset
    ),
  );
  assert.equal(install.operationHex, "0x002c");
  assert.equal(install.arguments[0].ascii, "HATO");
  assert.equal(
    install.arguments[1].value,
    evidence.hatoConversation.selector,
  );
  assert.equal(release.operationHex, "0x002c");
  assert.equal(release.arguments[0].ascii, "HATO");
  assert.equal(
    release.arguments[1].value,
    evidence.hatoConversation.releaseSelectorUnsigned,
  );
  assert.equal(evidence.hatoConversation.mappedSelectorWord, "0x8066");
  assert.equal(
    evidence.hatoConversation.releaseMappedSelectorWord,
    "0x8068",
  );
  assert.equal(
    evidence.hatoConversation.targetDataflow.copiedComponents[1].addendBits,
    "0x3fcccccd",
  );
});

test("event IR promotes only the proven low-level LKPT behavior", () => {
  const operation = semantics.operations.find(
    ({ operationId }) => operationId === 44,
  );
  assert.equal(operation.semanticId, "actor-look-point-control");
  assert.match(operation.provenBehavior, /LKPT/);
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /must not substitute whole-body root rotation/,
  );
  assert.deepEqual(
    evidence.operation.actorWrites
      .filter(({ offset }) => offset === "0x86" || offset === "0x90")
      .map(({ offset }) => offset),
    ["0x86", "0x90"],
  );
  assert.equal(
    evidence.operation.downstreamController.updateAddress,
    "0x0c107338",
  );
});
