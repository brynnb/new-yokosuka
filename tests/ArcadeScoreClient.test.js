import assert from "node:assert/strict";
import test from "node:test";
import { ArcadeScoreClient } from "../src/ArcadeScoreClient.js";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test("arcade scores are fetched in one batch and cached briefly", async () => {
  let calls = 0;
  let now = 1000;
  const client = new ArcadeScoreClient({
    now: () => now,
    fetchImpl: async () => {
      calls++;
      return jsonResponse({
        scores: [
          { machineId: "qte-0", score: 1200 },
          { machineId: "qte-1", score: 50000 },
          { machineId: "darts-0", score: 80.5 },
          { machineId: "darts-1", score: 75 },
        ],
      });
    },
  });

  await client.refresh();
  await client.refresh();
  assert.equal(calls, 1);
  assert.equal(client.highScore("qte-0"), 1200);
  assert.equal(client.highScore("darts-0"), 80.5);

  now += 60_001;
  await client.refresh();
  assert.equal(calls, 2);
});

test("submitting a score replaces the cache with the server result", async () => {
  let request;
  const client = new ArcadeScoreClient({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        machineId: "darts-1",
        score: 91.25,
        newHighScore: true,
      });
    },
  });

  const result = await client.submit("darts-1", 91.25, 42);
  assert.equal(result.newHighScore, true);
  assert.equal(client.highScore("darts-1"), 91.25);
  assert.equal(request.url, "/api/arcade-scores");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.keepalive, true);
  assert.deepEqual(
    JSON.parse(request.options.body),
    { characterId: 42, machineId: "darts-1", score: 91.25 },
  );
});

test("live high-score events only advance the cached record", () => {
  const client = new ArcadeScoreClient();
  assert.equal(client.applyHighScore("qte-0", 1200), true);
  assert.equal(client.applyHighScore("qte-0", 1100), false);
  assert.equal(client.applyHighScore("unknown", 9999), false);
  assert.equal(client.highScore("qte-0"), 1200);
});

test("score fetch failures are surfaced instead of using an offline fallback", async () => {
  const client = new ArcadeScoreClient({
    fetchImpl: async () => jsonResponse(null, { ok: false, status: 503 }),
  });
  await assert.rejects(client.refresh(), /failed \(503\)/i);
});
