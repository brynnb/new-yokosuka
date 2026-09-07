import assert from "node:assert/strict";
import test from "node:test";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRINGS,
} from "../src/MartialArtsCombat.js";
import {
  combatCommandGroups,
  maximumCombatCommandGroupCount,
  trimCombatCommandGroups,
} from "../play/combat/CombatCommandDisplay.js";

const combatInputs = [
  ...Object.values(MARTIAL_ARTS_MOVES).map(
    (move) => move.displayInput || move.input,
  ),
  ...MARTIAL_ARTS_STRINGS.map((string) => string.input),
  ...Object.values(MARTIAL_ARTS_FOLLOWUP_STAGES).map(
    (stage) => stage.input,
  ),
];

test("the live command cap comes from the longest real combat input", () => {
  assert.equal(maximumCombatCommandGroupCount(combatInputs), 8);
});

test("command trimming retains only the newest real-input-sized window", () => {
  const spam = Array.from(
    { length: 30 },
    (_, index) => ["hand", "leg", "throw"][index % 3],
  );
  assert.deepEqual(
    trimCombatCommandGroups(spam, 8),
    spam.slice(-8),
  );
});

test("simultaneous button chords remain one visible input group", () => {
  const input = [
    "up",
    "hand",
    "plus",
    "leg",
    "throw",
  ];
  assert.deepEqual(combatCommandGroups(input), [
    ["up"],
    ["hand", "plus", "leg"],
    ["throw"],
  ]);
  assert.deepEqual(trimCombatCommandGroups(input, 2), [
    "hand",
    "plus",
    "leg",
    "throw",
  ]);
});
