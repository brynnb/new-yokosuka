import assert from "node:assert/strict";
import test from "node:test";

import { createNativePresentationControlSemanticHandlers } from "../play/events/NativePresentationControlRuntime.js";

const execute = async (semanticId, values) => {
  const writes = [];
  const result = await createNativePresentationControlSemanticHandlers({
    writeNativePresentationField: detail => writes.push(detail),
  })[semanticId]({
    action: { callFileOffset: "0xbeef" },
    context: { location: { functionId: "0xcafe" } },
    readArgument: index => values[index],
  });
  return { result, writes };
};

test("fog enable route writes the exact fixed dword", async () => {
  const { result, writes } = await execute("native-fog-enable-control", [7]);
  assert.equal(result.status, "continued");
  assert.deepEqual(writes.map(({ offset, value }) => [offset, value]), [[0x0c20bc54, 1]]);
});

test("scroll global control writes the exact fixed dword", async () => {
  const { writes } = await execute("scroll-sprite-global-control-write", [0x12345678]);
  assert.deepEqual(writes.map(({ offset, value }) => [offset, value]), [[0x0c1f7128, 0x12345678]]);
});

test("scroll mode two enables the path before writing its exact value", async () => {
  const { result, writes } = await execute("scroll-sprite-mode-two-control", [2, 0xff000000]);
  assert.equal(result.status, "continued");
  assert.deepEqual(writes.map(({ offset, value }) => [offset, value]), [
    [0x0c1f7130, 1],
    [0x0c1f7134, 0xff000000],
  ]);
});
