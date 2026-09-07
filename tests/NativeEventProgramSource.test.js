import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";

import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeEventProgramSource,
} from "../play/events/NativeEventProgramSource.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";

function programFixture(overrides = {}) {
  const program = {
    id: "test-program",
    area: "TEST",
    entryFunction: "0x100",
    scriptedInteractions: [{
      actorCode: "TEST",
      entryFunction: "0x100",
      activation: {
        kind: "tagged-object-action",
        objectTag: "TEST",
        action: 1,
      },
    }],
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [],
        successors: [],
      }],
      unresolvedControlTransfers: [],
    }],
    ...overrides,
  };
  const text = `${JSON.stringify(program)}\n`;
  const sha256 = createHash("sha256").update(text).digest("hex");
  const descriptor = {
    id: program.id,
    area: program.area,
    entryFunction: program.entryFunction,
    scriptedInteractions: program.scriptedInteractions,
    asset: {
      path: `/data/native-event-programs/${sha256}.json`,
      sha256,
      byteLength: Buffer.byteLength(text),
    },
  };
  return {
    descriptor,
    index: {
      schema: "new-yokosuka-native-event-program-index-v1",
      programs: [descriptor],
      eventCamerasByArea: {},
    },
    program,
    response: () => ({
      ok: true,
      status: 200,
      text: async () => text,
    }),
    text,
  };
}

function sourceFor(fixture, fetchImpl, options = {}) {
  return createNativeEventProgramSource({
    index: fixture.index,
    fetchImpl,
    cryptoImpl: webcrypto,
    ...options,
  });
}

test("default fetch preserves the browser global receiver", async () => {
  const fixture = programFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function () {
    assert.equal(this, globalThis);
    return Promise.resolve(fixture.response());
  };
  try {
    const source = createNativeEventProgramSource({ index: fixture.index });
    assert.deepEqual(await source.loadProgram(fixture.program.id), fixture.program);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("program source verifies, deduplicates, and caches an exact program", async () => {
  const fixture = programFixture();
  let resolveRequest;
  const requested = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  let calls = 0;
  const source = sourceFor(fixture, async () => {
    calls += 1;
    return requested;
  });

  const first = source.loadProgram(fixture.program.id);
  const second = source.loadProgram(fixture.program.id);
  assert.equal(calls, 1);
  resolveRequest(fixture.response());
  assert.deepEqual(await first, fixture.program);
  assert.strictEqual(await second, await first);
  assert.strictEqual(await source.loadProgram(fixture.program.id), await first);
  assert.equal(calls, 1);
});

test("a failed program request is evicted so a later attempt can retry", async () => {
  const fixture = programFixture();
  let calls = 0;
  const source = sourceFor(fixture, async () => {
    calls += 1;
    return calls === 1
      ? { ok: false, status: 503, text: async () => "" }
      : fixture.response();
  });

  await assert.rejects(
    source.loadProgram(fixture.program.id),
    /HTTP 503/,
  );
  assert.deepEqual(await source.loadProgram(fixture.program.id), fixture.program);
  assert.equal(calls, 2);
});

test("program loads time out and remain retryable", async () => {
  const fixture = programFixture();
  let calls = 0;
  const source = sourceFor(fixture, (_path, { signal } = {}) => {
    calls += 1;
    if (calls > 1) return Promise.resolve(fixture.response());
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  }, { timeoutMs: 5 });

  await assert.rejects(
    source.loadProgram(fixture.program.id),
    error => error?.name === "TimeoutError",
  );
  assert.deepEqual(await source.loadProgram(fixture.program.id), fixture.program);
  assert.equal(calls, 2);
});

test("one cancelled caller does not abort a shared program request", async () => {
  const fixture = programFixture();
  let resolveRequest;
  const requested = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const source = sourceFor(fixture, async () => requested);
  const controller = new AbortController();

  const cancelled = source.loadProgram(fixture.program.id, {
    signal: controller.signal,
  });
  const survivor = source.loadProgram(fixture.program.id);
  controller.abort("room-unmounted");
  await assert.rejects(cancelled, error => error?.name === "AbortError");
  resolveRequest(fixture.response());
  assert.deepEqual(await survivor, fixture.program);
});

test("hash mismatches fail closed without caching malformed content", async () => {
  const fixture = programFixture();
  fixture.descriptor.asset.sha256 = "0".repeat(64);
  const source = sourceFor(fixture, async () => fixture.response());

  await assert.rejects(
    source.loadProgram(fixture.program.id),
    /hash does not match/,
  );
  assert.equal(source.cachedProgram(fixture.program.id), null);
});

test("a room change cancels a pending load before it can start execution", async () => {
  const fixture = programFixture();
  let resolveRequest;
  const requested = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const source = sourceFor(fixture, async () => requested);
  let executions = 0;
  const runtime = createNativeScriptedEventRuntime({
    programSource: source,
    actorByteState: createNativeActorByteState(),
    createExecution: () => {
      executions += 1;
      return {};
    },
  });

  const starting = runtime.startActorInteraction({
    area: "TEST",
    actorCode: "TEST",
    context: {
      selectedObjectTag: "TEST",
      selectedObjectAction: 1,
    },
  });
  assert.equal(runtime.status, "loading");
  assert.equal(runtime.cancel("world-change"), true);
  resolveRequest(fixture.response());
  assert.deepEqual(await starting, {
    status: "cancelled",
    reason: "world-change",
    programId: fixture.program.id,
    entryFunction: fixture.program.entryFunction,
    actorCode: "TEST",
  });
  assert.equal(executions, 0);
  assert.equal(runtime.current, null);
  assert.equal(runtime.status, "idle");
});
