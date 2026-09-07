import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCADE_GAMES,
  QTE_DIFFICULTIES,
  canReuseActiveEmulator,
  dartScoreFromRadius,
  dartTimeBonusForThrow,
  qteDifficulty,
  qtePromptDuration,
  qtePromptForIndex,
  qteReactionScore,
} from "../src/ArcadeGames.js";

test("darts scoring rewards the center and rejects misses", () => {
  assert.equal(dartScoreFromRadius(0), 50);
  assert.equal(dartScoreFromRadius(0.1), 25);
  assert.equal(dartScoreFromRadius(0.25), 20);
  assert.equal(dartScoreFromRadius(0.5), 10);
  assert.equal(dartScoreFromRadius(0.8), 5);
  assert.equal(dartScoreFromRadius(0.9), 0);
  assert.equal(dartTimeBonusForThrow(5, 8.5), 8.5);
  assert.equal(dartTimeBonusForThrow(0, 8.5), 0);
});

test("darts uses the physical cabinet instead of the canvas overlay", () => {
  assert.equal(ARCADE_GAMES.darts.mode, "physical");
  assert.equal(ARCADE_GAMES.darts.physicalKind, "darts");
});

test("QTE prompts cycle through directions and cabinet buttons", () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => qtePromptForIndex(index)),
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyA",
      "KeyB",
      "ArrowUp",
      "ArrowDown",
    ],
  );
});

test("QTE reaction score rewards faster input", () => {
  assert.equal(qteReactionScore(0.58, 0.58), 100);
  assert.equal(qteReactionScore(0.152, 0.58), 41);
  assert.equal(qteReactionScore(0, 0.58), 20);
});

test("QTE difficulty selection preserves the former timing as super hard", () => {
  assert.deepEqual(
    QTE_DIFFICULTIES.map(({ id, initialSeconds }) => [
      id,
      initialSeconds,
    ]),
    [
      ["easy", 1.5],
      ["normal", 1],
      ["hard", 0.75],
      ["super-hard", 0.5],
    ],
  );
  assert.equal(qteDifficulty(99).id, "super-hard");
  assert.equal(qtePromptDuration(3, 0), 0.5);
  assert.equal(qtePromptDuration(3, 100), 0.34);
  assert.equal(qtePromptDuration(0, 100), 0.9);
});

test("the paddle cabinet labels its middle control as Center", () => {
  assert.deepEqual(
    ARCADE_GAMES.paddles.controls.map(({ label }) => label),
    ["Left", "Center", "Right", "Exit Game"],
  );
});

test("clicking an active emulator cabinet reuses its running session", () => {
  assert.equal(
    canReuseActiveEmulator(true, ARCADE_GAMES.hangon, ARCADE_GAMES.hangon),
    true,
  );
  assert.equal(
    canReuseActiveEmulator(true, ARCADE_GAMES.hangon, ARCADE_GAMES.harrier),
    false,
  );
  assert.equal(
    canReuseActiveEmulator(false, ARCADE_GAMES.hangon, ARCADE_GAMES.hangon),
    false,
  );
});
