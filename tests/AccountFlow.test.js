import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CHARACTER_SLOTS,
  QUICK_PLAY_CONFIRMATION_KEY,
  characterSlots,
  cycleCharacterIndex,
  normalizeCharacterNameCapitalization,
  quickPlayConfirmationCount,
  recordQuickPlayConfirmation,
} from "../play/account/AccountRules.js";

test("character selection always exposes exactly eight slots", () => {
  const characters = [
    { id: 1, name: "Akira" },
    { id: 2, name: "Nozomi" },
  ];
  const slots = characterSlots(characters);

  assert.equal(MAX_CHARACTER_SLOTS, 8);
  assert.equal(slots.length, 8);
  assert.deepEqual(slots.slice(0, 2), characters);
  assert.deepEqual(slots.slice(2), Array(6).fill(null));
});

test("playable character cycling wraps in both directions", () => {
  assert.equal(cycleCharacterIndex(0, -1, 15), 14);
  assert.equal(cycleCharacterIndex(14, 1, 15), 0);
  assert.equal(cycleCharacterIndex(4, 1, 15), 5);
  assert.equal(cycleCharacterIndex(4, -1, 15), 3);
});

test("character names capitalize live using the server naming convention", () => {
  assert.equal(normalizeCharacterNameCapitalization("aLEX"), "Alex");
  assert.equal(
    normalizeCharacterNameCapitalization("jEAN-lUC pICARD"),
    "Jean-luc Picard",
  );
  assert.equal(normalizeCharacterNameCapitalization("-aLEX"), "-Alex");
});

test("Quick Play confirmation count persists in local browser storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(quickPlayConfirmationCount(storage), 0);
  assert.equal(recordQuickPlayConfirmation(storage), 1);
  assert.equal(recordQuickPlayConfirmation(storage), 2);
  assert.equal(recordQuickPlayConfirmation(storage), 3);
  assert.equal(quickPlayConfirmationCount(storage), 3);
  assert.equal(values.get(QUICK_PLAY_CONFIRMATION_KEY), "3");
});
