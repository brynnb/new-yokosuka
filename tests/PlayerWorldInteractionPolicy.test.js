import assert from "node:assert/strict";
import test from "node:test";
import {
  playerWorldInteractionAllowed,
} from "../play/interactions/PlayerWorldInteractionPolicy.js";

test("ordinary worlds allow direct player interactions", () => {
  assert.equal(playerWorldInteractionAllowed({
    world: { id: "dobuita" },
  }), true);
});

test("cutscene-only worlds reject direct player interactions", () => {
  assert.equal(playerWorldInteractionAllowed({
    world: { id: "op00", cutsceneOnly: true },
  }), false);
});

test("active presentation ownership rejects interactions in ordinary worlds", () => {
  assert.equal(playerWorldInteractionAllowed({
    world: { id: "dobuita" },
    presentationOwned: true,
  }), false);
});

test("missing world state cannot accept interactions", () => {
  assert.equal(playerWorldInteractionAllowed(), false);
});
