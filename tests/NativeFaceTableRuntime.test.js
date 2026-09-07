import assert from "node:assert/strict";
import test from "node:test";

import { createNativeFaceTableSemanticHandlers } from "../play/events/NativeFaceTableRuntime.js";

const action = mode => ({
  semanticId: mode === 0 ? "resolved-face-table-refresh" : "resolved-face-activity-query",
  arguments: [{ kind: "constant", ascii: "SINF" }],
});

test("FACE table refresh preserves missing actors as native no-ops", async () => {
  const handler = createNativeFaceTableSemanticHandlers({ resolveActor: () => null });
  const result = await handler["resolved-face-table-refresh"]({
    action: action(0),
    context: {},
    readArgument: index => [0x464e4953, 0, 0][index],
  });
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.nativeNoOp, true);
});

test("FACE table refresh delegates exact low-level ownership", async () => {
  const actor = {};
  const calls = [];
  const handler = createNativeFaceTableSemanticHandlers({
    resolveActor: () => actor,
    refreshFaceTable: detail => calls.push(detail) && { applied: true },
  });
  const result = await handler["resolved-face-table-refresh"]({
    action: action(0),
    context: {},
    readArgument: index => [0x464e4953, 0, 0][index],
  });
  assert.deepEqual(result.mutation, { applied: true });
  assert.equal(calls[0].actorTag, "SINF");
  assert.equal(calls[0].actor, actor);
});

test("FACE activity query preserves signed-byte comparison", async () => {
  const execute = value => createNativeFaceTableSemanticHandlers({
    resolveActor: () => ({}),
    queryActorActivity: () => value,
  })["resolved-face-activity-query"]({
    action: action(1),
    context: {},
    readArgument: index => [0x464e4953, 1, 0][index],
  });
  assert.equal((await execute(1)).result, 1);
  assert.equal((await execute(0xff)).result, 0);
});
