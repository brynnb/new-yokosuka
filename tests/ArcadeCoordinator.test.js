import assert from "node:assert/strict";
import test from "node:test";
import {
  ArcadeCoordinator,
  arcadeMachineId,
} from "../play/arcade/ArcadeCoordinator.js";

function createHarness() {
  const dartUpdates = [];
  const paddleUpdates = [];
  const scores = new Map([
    ["qte-0", 10],
    ["qte-1", 20],
    ["darts-0", 30],
    ["darts-1", 40],
  ]);
  const scoreClient = {
    refreshCalls: [],
    submitCalls: [],
    highScore: (machineId, fallback) => scores.get(machineId) ?? fallback,
    refresh(options = {}) {
      this.refreshCalls.push(options);
      return Promise.resolve(scores);
    },
    async submit(machineId, score, characterId) {
      this.submitCalls.push({ machineId, score, characterId });
      scores.set(machineId, score);
      return { machineId, score };
    },
    applyHighScore(machineId, score) {
      if ((scores.get(machineId) ?? -1) >= score) return false;
      scores.set(machineId, score);
      return true;
    },
  };
  const games = {
    active: false,
    game: null,
    sessionContext: null,
    state: null,
    hudUpdates: 0,
    updateHud() {
      this.hudUpdates += 1;
    },
  };
  const coordinator = new ArcadeCoordinator({
    accountSession: { character: { id: 7 } },
    dom: { arcadeStatus: { textContent: "" } },
    getGames: () => games,
    scoreClient,
    displays: {
      updateDartScores: (...args) => dartUpdates.push(args),
      updatePaddleScores: (...args) => paddleUpdates.push(args),
      setDartScoreVisibility() {},
      setPaddleScoreVisibility() {},
    },
  });
  return {
    coordinator,
    dartUpdates,
    games,
    paddleUpdates,
    scoreClient,
  };
}

test("arcade machine identity follows the selected physical cabinet", () => {
  assert.equal(arcadeMachineId("qte"), "qte-0");
  assert.equal(arcadeMachineId("paddles"), "qte-1");
  assert.equal(arcadeMachineId("darts", {
    interaction: { position: [0, 0, -4.6] },
  }), "darts-0");
  assert.equal(arcadeMachineId("darts", {
    interaction: { position: [0, 0, -3.7] },
  }), "darts-1");
  assert.equal(arcadeMachineId("hang-on"), null);
});

test("arcade coordinator owns score submission and physical display state", async () => {
  const harness = createHarness();
  const result = await harness.coordinator.submitScore(
    "darts",
    12.34567,
    { interaction: { position: [0, 0, -3.7] } },
  );
  assert.deepEqual(harness.scoreClient.submitCalls, [{
    machineId: "darts-1",
    score: 12.3457,
    characterId: 7,
  }]);
  assert.deepEqual(result, { machineId: "darts-1", score: 12.3457 });
  assert.equal(harness.dartUpdates.at(-1)[0], 1);
  assert.equal(harness.dartUpdates.at(-1)[1].highScore, 12.3457);
});

test("arcade world score loading redraws only after the load completes", async () => {
  const harness = createHarness();
  harness.coordinator.beginWorldLoad();
  assert.deepEqual(harness.scoreClient.refreshCalls, [{ force: true }]);
  await harness.coordinator.finishWorldLoad();
  assert.deepEqual(harness.coordinator.dartsHighScores, [30, 40]);
  assert.equal(harness.dartUpdates.length, 0);

  harness.coordinator.redrawLoadedHighScores();
  assert.equal(harness.dartUpdates.length, 2);
  assert.equal(harness.paddleUpdates.length, 1);
});
