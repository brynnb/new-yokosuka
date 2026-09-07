import assert from "node:assert/strict";
import test from "node:test";
import {
  hasNativeDialogueSelector,
  selectNativeDialogueEntry,
} from "../play/dialogue/NativeDialogueSelector.js";

test("the exact actor selector inventory is available by actor code", () => {
  assert.equal(hasNativeDialogueSelector("HATO"), true);
  assert.equal(hasNativeDialogueSelector("hato"), true);
  assert.equal(hasNativeDialogueSelector("NOPE"), false);
  assert.deepEqual(selectNativeDialogueEntry("NOPE"), {
    status: "missing",
    actorCode: "NOPE",
  });
});

test("BOB's native selector chooses its only exact body with state bank 2", () => {
  const result = selectNativeDialogueEntry("BOB_", {
    readStateBank(bank) {
      assert.equal(bank, 2);
      return 0;
    },
  });
  assert.equal(result.status, "selected");
  assert.equal(result.markerOffset, 0x8f);
  assert.equal(result.bodyOffset, 0x91);
  assert.equal(result.bodyByteLength, 77);
  assert.equal(result.bodyBytes.length, 77);
});

test("selectors stop explicitly at unavailable native state", () => {
  const result = selectNativeDialogueEntry("BOB_");
  assert.equal(result.status, "unresolved");
  assert.match(result.reasons[0], /^stateBank:/);
});
