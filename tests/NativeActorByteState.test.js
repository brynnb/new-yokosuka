import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorByteStateSemanticHandlers,
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

test("native actor byte state is sparse and deterministic", () => {
  const state = createNativeActorByteState();
  assert.equal(state.read("HATO"), 0);
  assert.equal(state.write("HATO", 4), true);
  assert.equal(state.write("AKIR", 2), true);
  assert.deepEqual(state.toJSON().actorBytes, { AKIR: 2, HATO: 4 });
  assert.equal(state.write("HATO", 0), true);
  assert.deepEqual(state.toJSON().actorBytes, { AKIR: 2 });
});

test("native actor byte state rejects invented identifiers and values", () => {
  const state = createNativeActorByteState();
  assert.throws(() => state.write("HAT", 1), /four-character/);
  assert.throws(() => state.write("HATO", 256), /must be a byte/);
});

test("native actor byte state replaces its values atomically", () => {
  const state = createNativeActorByteState({ HATO: 4 });
  state.replace({ actorBytes: { AKIR: 2 } });
  assert.equal(state.read("HATO"), 0);
  assert.equal(state.read("AKIR"), 2);
  assert.throws(
    () => state.replace({ actorBytes: { HATO: 256 } }),
    /must be a byte/,
  );
  assert.equal(state.read("AKIR"), 2);
});

test("operation 0x01af reads and writes exact per-actor byte state", async () => {
  const state = createNativeActorByteState({ HATO: 7 });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorByteStateSemanticHandlers({
      actorByteState: state,
    }),
  });
  const action = (mode, ...rest) => ({
    semanticId: "game-state-access",
    arguments: [
      { kind: "constant", value: mode },
      {
        kind: "constant",
        value: 0x4f544148,
        ascii: "HATO",
      },
      ...rest.map(value => ({ kind: "constant", value })),
    ],
  });
  assert.deepEqual(await execute(action(0x42)), { result: 7 });
  assert.deepEqual(await execute(action(0x41, 0x108)), {
    status: "continued",
  });
  assert.equal(state.read("HATO"), 8);
});
