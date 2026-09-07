import assert from "node:assert/strict";
import test from "node:test";
import { WorldSessionRuntime } from "../play/world/WorldSessionRuntime.js";

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

test("a newer world request cancels and supersedes the active load", async () => {
  let invalidations = 0;
  const firstStarted = deferred();
  const runtime = new WorldSessionRuntime({
    invalidatePendingLoads: () => { invalidations += 1; },
    isCancellation: (_error, signal) => signal.aborted,
  });
  const first = runtime.run({
    load: async (signal) => {
      firstStarted.resolve();
      await new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
  });
  await firstStarted.promise;
  const second = runtime.run({ load: async () => "second" });

  assert.equal(await second, "second");
  assert.equal(await first, "second");
  assert.equal(invalidations, 1);
  assert.equal(runtime.switching, false);
});

test("only the newest queued request survives repeated supersession", async () => {
  const started = deferred();
  const runtime = new WorldSessionRuntime({
    invalidatePendingLoads() {},
    isCancellation: (_error, signal) => signal.aborted,
  });
  const first = runtime.run({
    load: async (signal) => {
      started.resolve();
      await new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
  });
  await started.promise;
  const discarded = runtime.run({ load: async () => "discarded" });
  const winner = runtime.run({ load: async () => "winner" });

  assert.equal(await discarded, false);
  assert.equal(await winner, "winner");
  assert.equal(await first, "winner");
});

test("non-cancellation failures use the request error boundary", async () => {
  const errors = [];
  const runtime = new WorldSessionRuntime({
    invalidatePendingLoads() {},
    isCancellation: () => false,
  });
  const result = await runtime.run({
    load: async () => { throw new Error("broken"); },
    onError: error => errors.push(error.message),
  });
  assert.equal(result, false);
  assert.deepEqual(errors, ["broken"]);
});
