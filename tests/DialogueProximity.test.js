import assert from "node:assert/strict";
import test from "node:test";
import {
  DIALOGUE_INTERACTION_DISTANCE,
  isWithinDialogueRange,
} from "../play/dialogue/DialogueProximity.js";

test("NPC dialogue is available within three horizontal world units", () => {
  assert.equal(DIALOGUE_INTERACTION_DISTANCE, 3);
  assert.equal(
    isWithinDialogueRange(
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 20, z: 0 },
    ),
    true,
  );
  assert.equal(
    isWithinDialogueRange(
      { x: 0, y: 0, z: 0 },
      { x: 3.01, y: 0, z: 0 },
    ),
    false,
  );
});

test("NPC dialogue proximity rejects missing or invalid positions", () => {
  assert.equal(isWithinDialogueRange(null, { x: 0, z: 0 }), false);
  assert.equal(
    isWithinDialogueRange(
      { x: Number.NaN, z: 0 },
      { x: 0, z: 0 },
    ),
    false,
  );
});
