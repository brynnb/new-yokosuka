import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-character-selection-evidence.json",
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));

test("operation 0x2b resolves the native resident character table", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.validCharacterTableCaptureCount, 475);
  assert.equal(evidence.summary.invalidCharacterTableCaptureCount, 1);
  assert.equal(evidence.summary.distinctCharacterTableCount, 1);
  assert.equal(evidence.summary.sourceOperationCount, 6);
  assert.equal(evidence.summary.sourceActorCodeCount, 4);
  assert.equal(evidence.summary.distinctSelectedCharacterCodeCount, 4);
  assert.equal(evidence.summary.fullyResolvedSelectedCharacterCodeCount, 4);
  assert.equal(
    evidence.nativeEvidence.handlerPointerLiteralAddress,
    "0x0c1197a4",
  );
  assert.equal(
    evidence.nativeEvidence.characterLookupAddress,
    "0x0c1147ec",
  );
  assert.equal(
    evidence.nativeEvidence.characterTablePointerAddress,
    "0x0c21bc80",
  );
  assert.equal(evidence.nativeEvidence.actorCharacterIndexOffset, "0x08");
  assert.deepEqual(
    evidence.characterBindings.map((binding) => ({
      code: binding.residentCharacterCode,
      actorCodes: binding.sourceActorCodes,
      operationCount: binding.sourceOperationCount,
      indices: binding.observedCharacterIndices,
      captures: binding.resolvedCaptureHashCount,
    })),
    [
      {
        code: "MIK2",
        actorCodes: ["MIKI"],
        operationCount: 2,
        indices: [203],
        captures: 475,
      },
      {
        code: "NOR2",
        actorCodes: ["NORK"],
        operationCount: 1,
        indices: [237],
        captures: 475,
      },
      {
        code: "TJM2",
        actorCodes: ["TJMA"],
        operationCount: 2,
        indices: [310],
        captures: 475,
      },
      {
        code: "YUM2",
        actorCodes: ["YUMM"],
        operationCount: 1,
        indices: [366],
        captures: 475,
      },
    ],
  );
});

test("browser schedules preserve every operation-0x2b character selection", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x2b,
        ),
      ),
    ),
  );
  assert.equal(operations.length, 6);
  assert.equal(manifest.summary.residentCharacterSelectionOperationCount, 6);
  assert.equal(
    manifest.summary.captureProvenResidentCharacterSelectionCount,
    4,
  );
  assert.ok(manifest.generatedFrom.includes(
    "tools/evidence/scheduled-actor-character-selection-evidence.json",
  ));
  for (const operation of operations) {
    const binding = evidence.characterBindings.find(
      (candidate) => (
        candidate.residentCharacterCode
          === operation.residentCharacterCode
      ),
    );
    assert.ok(binding);
    assert.equal(
      operation.residentCharacterIndex,
      binding.observedCharacterIndices[0],
    );
    assert.equal(
      operation.residentCharacterSelectionEvidence
        .resolvedCaptureHashCount,
      475,
    );
    assert.equal(
      operation.residentCharacterSelectionEvidence
        .unresolvedCaptureHashCount,
      0,
    );
  }
});
