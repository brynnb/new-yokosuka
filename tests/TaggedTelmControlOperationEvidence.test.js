import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/tagged-telm-control-operation-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("operation 0x00f1 resolves a tagged TELM scene object", () => {
  assert.equal(evidence.operation.operationHex, "0x00f1");
  assert.equal(evidence.operation.targetArgumentIndex, 1);
  assert.equal(evidence.operation.associatedRecordTag, "TELM");
  assert.equal(evidence.d000Dataflow.literalTargetTag, "TEL0");
  assert.match(evidence.d000Dataflow.proof, /r9\+0x02e8/);
  assert.match(
    evidence.operation.unresolved.join(" "),
    /not that every upstream launch tag is itself the player's clickable trigger/i,
  );
});

test("operation 0x00f1 mode 10 enters exact TELM controller state 21", () => {
  const mode10 = evidence.operation.mode10;
  assert.equal(evidence.operation.modeDispatch.modeCount, 18);
  assert.equal(mode10.primaryLinkValue, -1);
  assert.equal(mode10.controllerStateFieldOffset, "0x013c");
  assert.equal(mode10.controllerStateValue, 21);
  assert.equal(mode10.controllerStateCount, 22);
  assert.equal(mode10.controllerState21HandlerAddress, "0x0c16f8a8");
  assert.match(mode10.semanticBoundary, /not assigned/i);
});

test("operation 0x00f1 mode 4 returns the exact TELM primary link", () => {
  assert.equal(evidence.schema, "new-yokosuka-tagged-telm-control-operation-evidence-v5");
  assert.equal(evidence.operation.mode4.primaryLinkFieldOffset, "0x0000");
  assert.equal(evidence.allDiscInventory.provenCallCount, 297);
  assert.deepEqual(
    evidence.allDiscInventory.dialogueRegionModeCounts,
    { 4: 44, 10: 55 },
  );
});

test("operation 0x00f1 binding and vector modes retain exact low-level boundaries", () => {
  assert.equal(evidence.operation.mode0.helperAddress, "0x0c16fbf4");
  assert.deepEqual(evidence.operation.mode1.clearedBindingValues, [0, -1]);
  assert.deepEqual(
    evidence.operation.mode11.destinationFieldOffsets,
    ["0x07bc", "0x07c0", "0x07c4"],
  );
  assert.deepEqual(
    evidence.operation.mode12.destinationFieldOffsets,
    ["0x07c8", "0x07cc", "0x07d0"],
  );
  assert.match(evidence.operation.mode11.semanticBoundary, /remain unnamed/i);
  assert.deepEqual(evidence.operation.bindingConsumer.selectorRoutes[3], {
    actorRenderKey: -66,
    ryoRuntimeMatrixIndex: 30,
    bodySide: "left",
  });
  assert.equal(
    evidence.operation.bindingConsumer.telephoneReceiverRenderControl,
    3,
  );
  assert.deepEqual(evidence.operation.bindingConsumer.handCorrection, {
    translation: [0.02499999850988388, 0.07499999552965164, 0],
    rotationAxis: "z",
    rotationFixedTurnRaw: 0x4000,
    rotationDegrees: 90,
    translationRoutineAddress: "0x0c1d28e0",
    rotationZRoutineAddress: "0x0c1d25c0",
  });
  assert.equal(evidence.allDiscInventory.remainingUnresolvedCallCount, 44);
});
