import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeDialogueActorRuntimeValueReader,
  nativeDialogueActorIdentityForRuntimeOperand,
  readNativeDialogueActorRuntimeValue,
} from "../play/dialogue/NativeDialogueActorRuntimeValue.js";
import {
  evaluateNativeDialoguePredicate,
} from "../play/dialogue/NativeDialoguePredicate.js";

test("native actor operands use the current person for zero", () => {
  assert.equal(
    nativeDialogueActorIdentityForRuntimeOperand(0, "HATO"),
    "HATO",
  );
  assert.equal(
    nativeDialogueActorIdentityForRuntimeOperand(0, "hato"),
    "HATO",
  );
});

test("nonzero actor operands index the exact fixed identity table", () => {
  assert.equal(
    nativeDialogueActorIdentityForRuntimeOperand(30, "AKIR"),
    "HATO",
  );
  assert.equal(
    nativeDialogueActorIdentityForRuntimeOperand(58, "AKIR"),
    null,
  );
  assert.equal(
    nativeDialogueActorIdentityForRuntimeOperand(301, "AKIR"),
    null,
  );
});

test("actor runtime values retain zero and reject unresolved state", () => {
  assert.equal(
    readNativeDialogueActorRuntimeValue(
      30,
      "AKIR",
      (actorCode) => actorCode === "HATO" ? 0 : null,
    ),
    0,
  );
  assert.equal(
    readNativeDialogueActorRuntimeValue(30, "AKIR", () => undefined),
    null,
  );
});

test("predicate reader resolves the authoritative scheduled actor state", () => {
  const networkState = {
    actorQueryStateForActorCode(actorCode, worldId) {
      assert.equal(actorCode, "HATO");
      assert.equal(worldId, "dobuita");
      return 7;
    },
  };
  const readActorRuntimeValue = createNativeDialogueActorRuntimeValueReader({
    networkState,
    getWorldId: () => "dobuita",
  });
  assert.deepEqual(evaluateNativeDialoguePredicate({
    kind: "actorRuntimeIdentity",
    value: 30,
    nativeValueType: 5,
  }, {
    currentActorCode: "AKIR",
    readActorRuntimeValue,
  }), {
    resolved: true,
    value: 7,
    reasons: [],
  });
});
