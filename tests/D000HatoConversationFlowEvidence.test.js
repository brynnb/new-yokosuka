import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/d000-hato-conversation-flow.json",
    import.meta.url,
  ),
));

test("Hato conversation preserves the exact four-phase native call order", () => {
  assert.equal(
    evidence.status,
    "exact-native-four-phase-conversation-flow",
  );
  assert.deepEqual(
    evidence.orderedPhases.map(
      ({ phase, controlCallFileOffset, functionFileOffset }) => ({
        phase,
        controlCallFileOffset,
        functionFileOffset,
      }),
    ),
    [
      {
        phase: "prelude",
        controlCallFileOffset: "0x800ca",
        functionFileOffset: "0x7f864",
      },
      {
        phase: "voice",
        controlCallFileOffset: "0x800d0",
        functionFileOffset: "0x7fa98",
      },
      {
        phase: "postlude",
        controlCallFileOffset: "0x800d6",
        functionFileOffset: "0x7fb60",
      },
      {
        phase: "cleanup",
        controlCallFileOffset: "0x80118",
        functionFileOffset: "0x7fd94",
      },
    ],
  );
});

test("Hato flow retains native staging operations without guessed labels", () => {
  const phases = Object.fromEntries(
    evidence.orderedPhases.map((item) => [item.phase, item]),
  );
  assert.deepEqual(
    phases.voice.nativeOperations.map(({ operationHex }) => operationHex),
    ["0x006d", "0x00b2", "0x01af", "0x01af"],
  );
  assert.deepEqual(
    phases.prelude.nativeOperations
      .find(({ operationHex }) => operationHex === "0x002c")
      .arguments
      .map(({ ascii, value }) => ascii || value),
    ["HATO", 15, undefined, 0],
  );
  const controlActorOperation = evidence.controlRoutine.nativeOperations
    .find(({ callFileOffset }) => callFileOffset === "0x800f0");
  assert.equal(controlActorOperation.operationHex, "0x002c");
  assert.equal(controlActorOperation.arguments[0].ascii, "HATO");
  assert.equal(controlActorOperation.arguments[1].value, 0xfffffff0);
});
