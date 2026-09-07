import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeObjectLinkSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function fourccWord(value) {
  return value.split("").reduce(
    (word, character, index) => (
      word | character.charCodeAt(0) << (index * 8)
    ),
    0,
  ) >>> 0;
}

function operand(value) {
  if (typeof value === "string") {
    return {
      kind: "constant",
      value: fourccWord(value),
      ascii: value,
    };
  }
  return { kind: "constant", value: value >>> 0 };
}

function action(source, target) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-link-field-zero-write",
    arguments: [operand(source), operand(target)],
  };
}

function adapters(calls, { objects = {}, slots = {} } = {}) {
  return {
    resolveNativeObjectLinkObject(objectTag) {
      calls.push(["resolve-object", objectTag]);
      return Object.hasOwn(objects, objectTag)
        ? objects[objectTag]
        : undefined;
    },
    resolveNativeObjectLinkSlot(index) {
      calls.push(["resolve-slot", index]);
      return Object.hasOwn(slots, index) ? slots[index] : undefined;
    },
    captureNativeObjectLinkStateA(object) {
      calls.push(["capture-a", object]);
      return [1, 2, 3];
    },
    captureNativeObjectLinkStateB(object) {
      calls.push(["capture-b", object]);
      return [4, 5, 6];
    },
    writeNativeObjectLinkFieldZero(detail) {
      calls.push(["write", detail]);
    },
    reconcileNativeObjectLinkStateA(object, words) {
      calls.push(["reconcile-a", object, words]);
    },
    reconcileNativeObjectLinkStateB(object, words) {
      calls.push(["reconcile-b", object, words]);
    },
  };
}

function executor(options) {
  return createNativeEventOperationExecutor({
    handlers: createNativeObjectLinkSemanticHandlers(options),
  });
}

test("operation 0x0043 preserves object target resolution and bracket order", async () => {
  const source = { tag: "AKIR" };
  const target = { tag: "PILO" };
  const calls = [];
  const result = await executor(adapters(calls, {
    objects: { AKIR: source, PILO: target },
  }))(action("AKIR", "PILO"));

  assert.deepEqual(calls, [
    ["resolve-object", "AKIR"],
    ["capture-a", source],
    ["capture-b", source],
    ["resolve-object", "PILO"],
    ["write", { sourceObject: source, targetObject: target }],
    ["reconcile-a", source, [1, 2, 3]],
    ["reconcile-b", source, [4, 5, 6]],
  ]);
  assert.deepEqual(result, {
    status: "continued",
    mutation: {
      sourceObjectTag: "AKIR",
      target: { kind: "resolved-object", objectTag: "PILO" },
    },
  });
});

test("operation 0x0043 preserves null and indexed-slot target routes", async () => {
  const source = {};
  const slotTarget = {};
  const nullCalls = [];
  const nullResult = await executor(adapters(nullCalls, {
    objects: { YKUR: source },
  }))(action("YKUR", -1));
  assert.deepEqual(
    nullCalls.find(call => call[0] === "write"),
    ["write", { sourceObject: source, targetObject: null }],
  );
  assert.deepEqual(nullResult.mutation.target, { kind: "null" });
  assert.equal(nullCalls.some(call => call[0] === "resolve-slot"), false);

  const slotCalls = [];
  const slotResult = await executor(adapters(slotCalls, {
    objects: { YKUR: source },
    slots: { 31: slotTarget },
  }))(action("YKUR", 31));
  assert.deepEqual(
    slotCalls.find(call => call[0] === "resolve-slot"),
    ["resolve-slot", 31],
  );
  assert.deepEqual(
    slotCalls.find(call => call[0] === "write"),
    ["write", { sourceObject: source, targetObject: slotTarget }],
  );
  assert.deepEqual(slotResult.mutation.target, {
    kind: "indexed-slot",
    index: 31,
  });
});

test("operation 0x0043 distinguishes missing objects from unavailable state", async () => {
  const source = {};
  const unavailableSource = await executor(adapters([], {
    objects: {},
  }))(action("AKIR", -1));
  assert.equal(
    unavailableSource.reason,
    "native-object-link-source-state-unavailable",
  );

  const missingSource = await executor(adapters([], {
    objects: { AKIR: null },
  }))(action("AKIR", -1));
  assert.equal(
    missingSource.reason,
    "native-object-link-source-object-missing",
  );

  const unavailableTarget = await executor(adapters([], {
    objects: { AKIR: source },
  }))(action("AKIR", "PILO"));
  assert.equal(
    unavailableTarget.reason,
    "native-object-link-target-state-unavailable",
  );

  const knownMissingTarget = await executor(adapters([], {
    objects: { AKIR: source, PILO: null },
  }))(action("AKIR", "PILO"));
  assert.equal(knownMissingTarget.status, "continued");
});

test("operation 0x0043 validates both captured three-word states before mutation", async () => {
  const source = {};
  const calls = [];
  const options = adapters(calls, { objects: { AKIR: source } });
  options.captureNativeObjectLinkStateB = object => {
    calls.push(["capture-b", object]);
    return [4, 5];
  };
  const result = await executor(options)(action("AKIR", -1));
  assert.match(result.reason, /state B must contain exactly three integer words/);
  assert.equal(calls.some(call => call[0] === "write"), false);
});

test("operation 0x0043 preflights route adapters before native state access", async () => {
  const calls = [];
  const options = adapters(calls, {
    objects: { AKIR: {} },
    slots: { 0: {} },
  });
  delete options.reconcileNativeObjectLinkStateB;
  const missingReconcile = await executor(options)(action("AKIR", -1));
  assert.equal(
    missingReconcile.reason,
    "native-object-link-reconcileNativeObjectLinkStateB-missing",
  );
  assert.deepEqual(calls, []);

  const slotCalls = [];
  const slotOptions = adapters(slotCalls, { objects: { AKIR: {} } });
  delete slotOptions.resolveNativeObjectLinkSlot;
  const missingSlot = await executor(slotOptions)(action("AKIR", 0));
  assert.equal(
    missingSlot.reason,
    "native-object-link-slot-resolver-missing",
  );
  assert.deepEqual(slotCalls, []);
});
