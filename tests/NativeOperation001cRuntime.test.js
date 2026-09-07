import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation001cSemanticHandlers,
  createNativeOperation001cState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function fourcc(value) {
  return (
    value.charCodeAt(0)
    | value.charCodeAt(1) << 8
    | value.charCodeAt(2) << 16
    | value.charCodeAt(3) << 24
  ) >>> 0;
}

function action(objectTag, destination, flags) {
  return {
    semanticId: "native-operation-001c-packed-word-query",
    arguments: [
      { kind: "constant", value: fourcc(objectTag), ascii: objectTag },
      { kind: "constant", value: destination },
      { kind: "constant", value: flags },
    ],
  };
}

function addressAction(objectTag, kind, offset, flags) {
  const value = action(objectTag, 0, flags);
  value.callFileOffset = 0x88;
  value.arguments[1] = { kind, offset };
  return value;
}

function execute(handlers = {}) {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation001cSemanticHandlers(handlers),
  });
}

test("operation 0x001c writes direct and associated low words", async () => {
  const state = createNativeOperation001cState();
  state.configureObject({
    objectTag: "AKIR",
    present: true,
    directWords: [0x12345678, 0xabcdef01, 0xffff0002],
    associatedWords: [0x80010003, 0x40020004, 0x20030005],
  });
  state.configureOutput(0x2000, [9, 8, 7]);
  const context = { nativeOperation001cState: state };

  await execute()(action("AKIR", 0x2000, 0), context);
  assert.deepEqual(state.readOutput(0x2000), [0x5678, 0xef01, 2]);

  await execute()(action("AKIR", 0x2000, 0x40000000), context);
  assert.deepEqual(state.readOutput(0x2000), [3, 4, 5]);
});

test("operation 0x001c preserves distinct missing-object routes", async () => {
  const state = createNativeOperation001cState();
  state.configureObject({ objectTag: "MISS", present: false });
  state.configureOutput(0x2000, [0x12345, 0x23456, 0x34567]);
  const context = { nativeOperation001cState: state };

  await execute()(action("MISS", 0x2000, 0), context);
  assert.deepEqual(state.readOutput(0x2000), [0x2345, 0x3456, 0x4567]);

  state.configureOutput(0x2000, [1, 2, 3]);
  await execute()(action("MISS", 0x2000, 0x40000000), context);
  assert.deepEqual(state.readOutput(0x2000), [0, 0, 0]);
});

test("operation 0x001c special routes preserve helper and zeroing boundaries", async () => {
  const state = createNativeOperation001cState();
  state.configureOutput(0x3000, [0xaaaa, 0xbbbb, 0xcccc]);
  const calls = [];
  const run = execute({
    queryDirectSpecialWord(detail) {
      calls.push(["direct", detail]);
      return 0x12345678;
    },
    queryAssociatedSpecialWord(detail) {
      calls.push(["associated", detail]);
      return 0xabcdef01;
    },
  });
  const context = { nativeOperation001cState: state };
  await run(action("AKIR", 0x3000, 0x02000000), context);
  assert.deepEqual(state.readOutput(0x3000), [0, 0x5678, 0]);

  state.configureOutput(0x3000, [1, 2, 3]);
  await run(action("AKIR", 0x3000, 0x42000000), context);
  assert.deepEqual(state.readOutput(0x3000), [0, 0xef01, 0]);
  assert.deepEqual(calls.map(([route]) => route), ["direct", "associated"]);
  assert.equal(calls[0][1].sourcePointer, 0x3004);
  assert.deepEqual(calls[0][1].sourceWords, [0xaaaa, 0xbbbb, 0xcccc]);
});

test("operation 0x001c stops before missing exact state and adapters", async () => {
  assert.equal(
    (await execute()(action("AKIR", 0x2000, 0))).reason,
    "native-operation-001c-state-unavailable",
  );
  const state = createNativeOperation001cState();
  state.configureOutput(0x2000, [1, 2, 3]);
  assert.equal(
    (await execute()(action("AKIR", 0x2000, 0), {
      nativeOperation001cState: state,
    })).reason,
    "native-operation-001c-object-state-unavailable",
  );
  assert.equal(
    (await execute()(action("AKIR", 0x2000, 0x02000000), {
      nativeOperation001cState: state,
    })).reason,
    "native-operation-001c-direct-special-query-missing",
  );
  assert.equal(
    (await execute()(action("AKIR", 0x2000, 1), {
      nativeOperation001cState: state,
    })).reason,
    "native-operation-001c-flags-unproved",
  );
  let queried = false;
  const emptyState = createNativeOperation001cState();
  assert.equal(
    (await execute({
      queryDirectSpecialWord() {
        queried = true;
        return 1;
      },
    })(action("AKIR", 0x3000, 0x02000000), {
      nativeOperation001cState: emptyState,
    })).reason,
    "native-operation-001c-output-state-unavailable",
  );
  assert.equal(queried, false);
});

test("operation 0x001c integrates with scene state and rejects stale plans", async () => {
  const scene = createNativeSceneGameplayState();
  scene.configureNativeOperation001cObject({
    objectTag: "AKIR",
    present: true,
    directWords: [1, 2, 3],
  });
  scene.configureNativeOperation001cOutput(0x4000, [4, 5, 6]);
  await execute()(action("AKIR", 0x4000, 0), (
    createNativeSceneFieldRuntimeContext(scene)
  ));
  assert.deepEqual(scene.readNativeOperation001cOutput(0x4000), [1, 2, 3]);

  const state = createNativeOperation001cState();
  state.configureObject({
    objectTag: "AKIR",
    present: true,
    directWords: [1, 2, 3],
  });
  state.configureOutput(0x4000, [4, 5, 6]);
  const plan = state.planNormal({
    objectTag: "AKIR",
    destination: 0x4000,
    associated: false,
  });
  state.configureOutput(0x4000, [7, 8, 9]);
  assert.throws(() => state.commit(plan), /changed before commit/);
});

test("operation 0x001c writes exact frame and scene address destinations", async () => {
  const state = createNativeOperation001cState();
  state.configureObject({
    objectTag: "AKIR",
    present: true,
    directWords: [0x11112222, 0x33334444, 0x55556666],
    associatedWords: [0x77778888, 0x9999aaaa, 0xbbbbcccc],
  });
  const frame = new Map([[0x20, 1], [0x24, 2], [0x28, 3]]);
  const scene = new Map([[0x40, 4], [0x44, 5], [0x48, 6]]);
  const writes = [];
  const context = {
    nativeOperation001cState: state,
    location: { functionId: 0x44 },
    readFrameField: offset => frame.get(offset),
    writeFrameField(detail) {
      writes.push(detail);
      frame.set(detail.offset, detail.value);
    },
    readSceneField: offset => scene.get(offset),
    writeSceneField(detail) {
      writes.push(detail);
      scene.set(detail.offset, detail.value);
    },
  };

  await execute()(
    addressAction("AKIR", "frame-address", 0x20, 0),
    context,
  );
  assert.deepEqual([...frame.values()], [0x2222, 0x4444, 0x6666]);
  await execute()(
    addressAction("AKIR", "scene-address", 0x40, 0x40000000),
    context,
  );
  assert.deepEqual([...scene.values()], [0x8888, 0xaaaa, 0xcccc]);
  assert.deepEqual(writes[0].source, {
    functionFileOffset: 0x44,
    callFileOffset: 0x88,
  });
  assert.equal(state.outputs.size, 0);
});

test("operation 0x001c fills newly allocated normal stack scratch", async () => {
  const state = createNativeOperation001cState();
  state.configureObject({
    objectTag: "AKIR",
    present: true,
    directWords: [0x11112222, 0x33334444, 0x55556666],
  });
  const frame = new Map();
  const result = await execute()(
    addressAction("AKIR", "frame-address", 0x20, 0),
    {
      nativeOperation001cState: state,
      readFrameField: offset => frame.get(offset),
      writeFrameField: ({ offset, value }) => frame.set(offset, value),
    },
  );
  assert.equal(result.status, "continued");
  assert.deepEqual([...frame.values()], [0x2222, 0x4444, 0x6666]);
});

test("operation 0x001c special address routes expose destination plus four", async () => {
  const state = createNativeOperation001cState();
  const frame = new Map([[0x20, 1], [0x24, 2], [0x28, 3]]);
  let query;
  const context = {
    nativeOperation001cState: state,
    readFrameField: offset => frame.get(offset),
    writeFrameField: ({ offset, value }) => frame.set(offset, value),
  };
  const run = execute({
    queryDirectSpecialWord(detail) {
      query = detail;
      return 0x12345678;
    },
  });

  await run(
    addressAction("AKIR", "frame-address", 0x20, 0x02000000),
    context,
  );
  assert.deepEqual(query, {
    objectTag: "AKIR",
    sourceAddress: { kind: "frame-address", offset: 0x24 },
    sourceWords: [1, 2, 3],
  });
  assert.deepEqual([...frame.values()], [0, 0x5678, 0]);
});
