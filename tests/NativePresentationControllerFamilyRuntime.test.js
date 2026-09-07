import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativePresentationControllerFamilyAdapter,
  createNativePresentationControllerFamilySemanticHandlers,
  NativePresentationControllerFamilyAdapter,
} from "../play/events/NativePresentationControllerFamilyRuntime.js";

function executionContext(operationHex, mode, words, applyRoute) {
  const handlers = createNativePresentationControllerFamilySemanticHandlers({
    applyNativePresentationControllerRoute: applyRoute,
  });
  const semanticId = `native-operation-${operationHex}-control`;
  return handlers[semanticId]({
    context: {},
    readArgument(index) {
      if (index >= words.length) {
        throw new Error(`missing argument ${index}`);
      }
      return index === 0 ? mode : words[index];
    },
  });
}

test("operation 0x0175 preserves all authored helper routes", async () => {
  const calls = [];
  const invoke = (mode, words) => executionContext(
    "0175",
    mode,
    words,
    detail => {
      calls.push(detail);
      return { mutation: { applied: mode } };
    },
  );

  for (const [mode, words] of [
    [1, [1]],
    [2, [2]],
    [15, [15, 0x3f800000]],
    [21, [21, 1924]],
    [23, [23, 0]],
    [24, [24, 1]],
    [25, [25, 0]],
    [27, [27]],
  ]) {
    assert.equal((await invoke(mode, words)).status, "continued");
  }

  assert.deepEqual(calls.map(call => ({
    mode: call.mode,
    helpers: call.helpers,
    forwardedWords: call.forwardedWords,
    truthyBranch: call.truthyBranch,
    forwardsPreviousResult: call.forwardsPreviousResult,
  })), [
    { mode: 1, helpers: ["0x0c1badbc"], forwardedWords: [], truthyBranch: undefined, forwardsPreviousResult: undefined },
    { mode: 2, helpers: ["0x0c1baed0"], forwardedWords: [], truthyBranch: undefined, forwardsPreviousResult: undefined },
    { mode: 15, helpers: ["0x0c1baf0c"], forwardedWords: [0x3f800000], truthyBranch: undefined, forwardsPreviousResult: undefined },
    { mode: 21, helpers: ["0x0c1bc5f8"], forwardedWords: [1924], truthyBranch: undefined, forwardsPreviousResult: undefined },
    { mode: 23, helpers: ["0x0c1bc5f8"], forwardedWords: [0x0780], truthyBranch: false, forwardsPreviousResult: undefined },
    { mode: 24, helpers: ["0x0c1bc5ee"], forwardedWords: [0x1800], truthyBranch: true, forwardsPreviousResult: undefined },
    { mode: 25, helpers: ["0x0c1bc5f8"], forwardedWords: [12], truthyBranch: false, forwardsPreviousResult: undefined },
    { mode: 27, helpers: ["0x0c1baeee", "0x0c1bcb32"], forwardedWords: [], truthyBranch: undefined, forwardsPreviousResult: true },
  ]);
});

test("operation 0x0176 selects the executable-proven boolean helper", async () => {
  const calls = [];
  for (const value of [0, 1]) {
    assert.equal((await executionContext(
      "0176",
      1,
      [1, value],
      detail => {
        calls.push(detail);
        return { value };
      },
    )).status, "continued");
  }
  assert.deepEqual(calls.map(({ helpers, truthyBranch }) => ({
    helpers,
    truthyBranch,
  })), [
    { helpers: ["0x0c1ba8fa"], truthyBranch: false },
    { helpers: ["0x0c1baae4"], truthyBranch: true },
  ]);
});

test("operation 0x0178 returns created handles and preserves release routes", async () => {
  const calls = [];
  const created = await executionContext(
    "0178",
    6,
    [6, 1, 2, 3, 4, 5, 6],
    detail => {
      calls.push(detail);
      return { result: 0x1234 };
    },
  );
  assert.deepEqual(created, { result: 0x1234 });
  assert.deepEqual(calls[0].vectorWordGroups, [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(calls[0].helpers, [
    "0x0c1c1794",
    "0x0c1bb2da",
    "0x0c0bb342",
  ]);

  const released = await executionContext(
    "0178",
    7,
    [7, 0x1234],
    detail => ({ mutation: detail.helpers }),
  );
  assert.deepEqual(released, {
    status: "continued",
    mutation: ["0x0c1bb514", "0x0c1c17d8"],
  });
});

test("operation 0x0179 preserves OP00 scalar and paired-vector ABI", async () => {
  const calls = [];
  for (const [mode, words] of [
    [2, [2, 0x40a00000]],
    [3, [3]],
    [4, [4, 0x3f800000]],
    [7, [7, 0x20ffffff]],
    [11, [11, 0x40e00000]],
    [12, [12]],
    [13, [13, 0x3dcccccd]],
    [14, [14, 0x3dcccccd, 1]],
    [16, [16, 0xffc7d3e8]],
    [18, [18, 0x3d4ccccd]],
    [36, [36, 1, 2, 3, 4, 5, 6]],
    [37, [37, 7, 8, 9, 10, 11, 12]],
  ]) {
    assert.equal((await executionContext(
      "0179",
      mode,
      words,
      detail => {
        calls.push(detail);
        return { mutation: detail.mode };
      },
    )).status, "continued");
  }
  assert.deepEqual(calls.find(call => call.mode === 14).forwardedWords, [
    1,
    0x3dcccccd,
  ]);
  assert.deepEqual(calls.find(call => call.mode === 36).vectorWordGroups, [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  assert.equal(calls.find(call => call.mode === 37).helpers[0], "0x0c1bbc24");
});

test("operation 0x0179 preserves all-disc aggregate and literal-control routes", async () => {
  const calls = [];
  const apply = detail => {
    calls.push(detail);
    return { mutation: detail.mode };
  };
  assert.equal((await executionContext(
    "0179",
    38,
    [38, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    apply,
  )).status, "continued");
  for (const [mode, words] of [
    [39, [39, 0x1234, 7]],
    [41, [41, 0x40]],
    [42, [42, 0x80, 9]],
    [44, [44, 0x1234, 7]],
    [47, [47, 0x80, 9]],
  ]) {
    assert.equal((await executionContext(
      "0179",
      mode,
      words,
      apply,
    )).status, "continued");
  }
  const aggregate = calls[0];
  assert.deepEqual(aggregate.helpers, [
    "0x0c1bb738",
    "0x0c1bba4a",
    "0x0c1bbd6c",
  ]);
  assert.deepEqual(aggregate.vectorWordGroups, [
    [1, 2], [3, 4], [5, 6], [7, 8],
  ]);
  assert.deepEqual(aggregate.scalarFloatWords, [9, 10]);
  assert.deepEqual(calls.find(call => call.mode === 39).forwardedWords, [
    0x1234, 7, 0,
  ]);
  assert.deepEqual(calls.find(call => call.mode === 44).forwardedWords, [
    0x1234, 7, 1,
  ]);
  assert.equal(calls.find(call => call.mode === 42).helpers[0], "0x0c1bc4b6");
  assert.equal(calls.find(call => call.mode === 47).forwardedWords[2], 1);
});

test("the controller family fails closed for unsupported routes and adapters", async () => {
  assert.deepEqual(await executionContext(
    "0179",
    40,
    [40],
    () => ({ mutation: true }),
  ), {
    status: "stopped",
    reason: "native-operation-0179-mode-unproved",
  });
  assert.deepEqual(await executionContext("0175", 15, [15, 0], undefined), {
    status: "stopped",
    reason: "native-presentation-controller-adapter-missing",
  });
  assert.deepEqual(await executionContext(
    "0178",
    1,
    [1, 8192],
    () => undefined,
  ), {
    status: "stopped",
    reason: "native-presentation-controller-handle-unavailable",
  });
});

test("the typed adapter is shared by every family handler", async () => {
  const calls = [];
  const adapter = createNativePresentationControllerFamilyAdapter({
    applyRoute: detail => {
      calls.push(detail);
      return detail.returnsHandle
        ? { result: 9 }
        : { mutation: detail.operationHex };
    },
  });
  assert.ok(adapter instanceof NativePresentationControllerFamilyAdapter);
  assert.equal(createNativePresentationControllerFamilyAdapter(adapter), adapter);
  const handlers = createNativePresentationControllerFamilySemanticHandlers({
    adapter,
  });
  const invoke = (semanticId, words) => handlers[semanticId]({
    context: {},
    readArgument: index => words[index],
  });

  assert.equal((await invoke("native-operation-0175-control", [15, 0])).status, "continued");
  assert.equal((await invoke("native-operation-0176-control", [1, 1])).status, "continued");
  assert.equal((await invoke("native-operation-0178-control", [1, 8192])).result, 9);
  assert.equal((await invoke("native-operation-0179-control", [12])).status, "continued");
  assert.deepEqual(calls.map(call => call.operationId), [
    0x0175,
    0x0176,
    0x0178,
    0x0179,
  ]);
  assert.throws(
    () => createNativePresentationControllerFamilyAdapter({ applyRoute: 1 }),
    /applyRoute adapter must be a function/,
  );
  assert.throws(
    () => createNativePresentationControllerFamilySemanticHandlers({ adapter: {} }),
    /adapter has an invalid type/,
  );
});
