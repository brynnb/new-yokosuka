import assert from "node:assert/strict";
import test from "node:test";
import { ArcadeGames, ARCADE_GAMES } from "../src/ArcadeGames.js";
import { ArcadeScoreClient } from "../src/ArcadeScoreClient.js";
import { closeArcadeResults, openArcadeResults, refreshArcadeResults, useArcadeResultsStore } from "../play/ui/react/arcadeResultsStore.js";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const entry = { characterId: 1, playerName: "Ryo", score: 125, achievedAt: "2026-09-07T12:00:00Z" };

function gameHarness(id) {
  const game = Object.create(ArcadeGames.prototype);
  const calls = [];
  const results = [];
  const save = deferred();
  Object.assign(game, {
    active: true, game: ARCADE_GAMES[id], state: { over: false, score: 125, highScore: 0 },
    completedRound: null, sessionContext: {}, lastScores: new Map(),
    submitScore: (...args) => { calls.push(args); return save.promise; },
    updateHud() {}, onFinished: round => results.push(round),
    // Rendering/input teardown is covered in the real-browser test.
    close() { this.active = false; this.completedRound = null; },
  });
  return { game, calls, results, save };
}

for (const id of ["qte", "paddles", "darts"]) {
  test(`${id} records a completed game once and keeps its score through teardown`, async () => {
    const { game, calls, results, save } = gameHarness(id);
    if (id === "paddles") { game.state.over = true; game.recordCompletedRound(); }
    else game.finish("Game over");
    game.recordCompletedRound();
    game.recordCompletedRound();
    assert.equal(calls.length, 1);
    const round = game.completedRound;
    game.state.score = 0; // Physical cabinets reset their live displays.
    game.showCompletedRound();
    assert.equal(results.length, 1);
    assert.equal(round.score, 125);
    assert.equal(calls[0][1], 125);
    game.state = { highScore: 7 };
    game.active = true; // A new round, even with the exact same context.
    save.resolve({ score: 200 });
    assert.deepEqual(await round.submission, { saved: true });
    assert.equal(game.state.highScore, 7);
  });
}

test("abandoning a game never requests a leaderboard or submits a score", () => {
  const { game, calls, results } = gameHarness("qte");
  game.dismiss();
  assert.equal(calls.length, 0);
  assert.equal(results.length, 0);
});

test("results wait for saving, retry reads, and ignore cancelled/replaced responses", async () => {
  const save = deferred();
  const stale = deferred();
  let calls = 0;
  let signal;
  const options = {
    title: "Excite QTE", score: 125, machineId: "qte-0", submission: save.promise,
    scoreClient: { leaderboard: (_id, options) => { calls++; signal = options.signal; return stale.promise; } },
  };
  openArcadeResults(options);
  assert.equal(calls, 0);
  save.resolve({ saved: true });
  await tick();
  assert.equal(calls, 1);
  closeArcadeResults();
  assert.equal(signal.aborted, true);
  let retry = 0;
  openArcadeResults({ ...options, title: "Darts", submission: Promise.resolve({ saved: false }), scoreClient: {
    async leaderboard() { if (!retry++) throw Error("offline"); return [entry]; },
  } });
  await tick();
  assert.equal(useArcadeResultsStore.getState().status, "error");
  assert.match(useArcadeResultsStore.getState().saveWarning, /could not be confirmed/);
  await refreshArcadeResults();
  stale.resolve([{ ...entry, score: 999 }]);
  await tick();
  assert.equal(useArcadeResultsStore.getState().title, "Darts");
  assert.equal(useArcadeResultsStore.getState().status, "ready");
  assert.deepEqual(useArcadeResultsStore.getState().entries, [entry]);
  closeArcadeResults();
});

test("closing during save does not start a late leaderboard load", async () => {
  const save = deferred();
  let loaded = false;
  openArcadeResults({ submission: save.promise, scoreClient: { leaderboard() { loaded = true; } } });
  closeArcadeResults();
  save.resolve({ saved: true });
  await tick();
  assert.equal(loaded, false);
  assert.equal(useArcadeResultsStore.getState().open, false);
});

test("leaderboard transport validates shape and preserves returned dates", async () => {
  let body = { machineId: "darts-0", entries: [entry] };
  let url;
  const client = new ArcadeScoreClient({ fetchImpl: async input => { url = input; return { ok: true, json: async () => body }; } });
  assert.deepEqual(await client.leaderboard("darts-0"), [entry]);
  assert.equal(url, "/api/arcade-scores?machineId=darts-0");
  for (const invalid of [null, { machineId: "qte-0", entries: [] }, { machineId: "darts-0", entries: [{ ...entry, achievedAt: "yesterday" }] }, { machineId: "darts-0", entries: [entry, entry] }]) {
    body = invalid;
    await assert.rejects(client.leaderboard("darts-0"), /invalid/);
  }
  await assert.rejects(client.leaderboard("';DROP TABLE"), /Invalid arcade machine/);
});

test("both save and leaderboard requests time out, and reads can be cancelled", async () => {
  const client = new ArcadeScoreClient({ requestTimeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }) });
  await assert.rejects(client.leaderboard("qte-0"), { name: "TimeoutError" });
  await assert.rejects(client.submit("qte-0", 123, 1), { name: "TimeoutError" });
  const controller = new AbortController();
  const read = client.leaderboard("qte-0", { signal: controller.signal });
  controller.abort();
  await assert.rejects(read, { name: "AbortError" });
});
