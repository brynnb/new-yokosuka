import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventControlRecordSemanticHandlers,
} from "../play/events/NativeEventControlRecordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(selector) {
  return {
    kind: "engineOperation",
    semanticId: "current-event-control-field-query",
    arguments: [{ kind: "constant", value: selector }],
  };
}

test("queries all eight exact unsigned event-control fields", async () => {
  const state = createNativeSceneGameplayState();
  state.configureCurrentEventControlRecord({
    word04: 0x12345,
    word08: 0x23456,
    word0a: 0x34567,
    byte0c: 0x178,
    byte0d: 0x189,
    byte0e: 0x19a,
    byte0f: 0x1ab,
    word12: 0x45678,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeEventControlRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const expected = [
    [0x04, 2, 0x2345],
    [0x08, 2, 0x3456],
    [0x0a, 2, 0x4567],
    [0x0c, 1, 0x78],
    [0x0d, 1, 0x89],
    [0x0e, 1, 0x9a],
    [0x0f, 1, 0xab],
    [0x12, 2, 0x5678],
  ];
  for (const [selector, [offset, width, result]] of expected.entries()) {
    assert.deepEqual(await execute(action(selector), context), {
      result,
      query: { selector, offset, width, result },
    });
  }
});

test("stops when current event state or selector is unavailable", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeEventControlRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.match(
    (await execute(action(1), context)).reason,
    /record is unavailable/,
  );
  state.configureCurrentEventControlRecord({
    word04: 0,
    word08: 0,
    word0a: 0,
    byte0c: 0,
    byte0d: 0,
    byte0e: 0,
    byte0f: 0,
    word12: 0,
  });
  assert.match(
    (await execute(action(8), context)).reason,
    /between zero and seven/,
  );
});

test("current event records have an explicit transaction lifetime", () => {
  const state = createNativeSceneGameplayState();
  state.configureCurrentEventControlRecord({
    word04: 1,
    word08: 0,
    word0a: 0,
    byte0c: 0,
    byte0d: 0,
    byte0e: 0,
    byte0f: 0,
    word12: 0x8080,
  });
  assert.equal(state.clearCurrentEventControlRecord().word04, 1);
  assert.equal(state.readCurrentEventControlRecord(), undefined);
});

test("live controller input updates both observed event input words", () => {
  const state = createNativeSceneGameplayState();
  state.configureCurrentEventControlRecord({
    word04: 1,
    word08: 0,
    word0a: 0,
    byte0c: 0,
    byte0d: 0,
    byte0e: 0,
    byte0f: 0,
    word12: 0x8080,
  });
  assert.deepEqual(state.writeCurrentEventControllerInput(0x0200), {
    word04: 1,
    word08: 0x0200,
    word0a: 0x0200,
    byte0c: 0,
    byte0d: 0,
    byte0e: 0,
    byte0f: 0,
    word12: 0x8080,
  });
  assert.equal(state.queryCurrentEventControlField(1).result, 0x0200);
  assert.equal(state.queryCurrentEventControlField(2).result, 0x0200);
  state.writeCurrentEventControllerInput(0);
  assert.equal(state.queryCurrentEventControlField(1).result, 0);
});
