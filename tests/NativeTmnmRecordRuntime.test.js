import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeTmnmRecordSemanticHandlers,
  createNativeTmnmRecordState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(objectTag, resourceId, ...words) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-tmnm-parameter-write",
    arguments: [
      { kind: "constant", value: 0, ascii: objectTag },
      ...[resourceId, ...words].map(value => ({
        kind: "constant",
        value,
      })),
    ],
  };
}

function runtime(state, applyResource) {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTmnmRecordSemanticHandlers({
      applyResource,
    }),
  });
  return actionValue => execute(actionValue, {
    nativeTmnmRecords: state,
  });
}

function configureRecord(state, objectTag = "AKIR") {
  state.configure({
    objectTag,
    word0c: 0x11111111,
    word10: 0x22222222,
    word14: 0x33333333,
    word18: 0x44444444,
    word1c: 0x0050,
  });
}

test("operation 0x00fb clears only the exact TMNM word at +0x00", async () => {
  const state = createNativeTmnmRecordState();
  configureRecord(state, "KOI0");
  state.configure({ objectTag: "KOI0", word00: 0x12345678 });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTmnmRecordSemanticHandlers(),
  });
  const result = await execute({
    kind: "engineOperation",
    semanticId: "resolved-object-tmnm-word-zero-reset",
    callFileOffset: "0x5e76",
    arguments: [{ kind: "constant", value: 0, ascii: "KOI0" }],
  }, { nativeTmnmRecords: state });

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    applied: true,
    objectTag: "KOI0",
    previous: 0x12345678,
    word00: 0,
  });
  assert.deepEqual(state.read("KOI0"), {
    word00: 0,
    word0c: 0x11111111,
    word10: 0x22222222,
    word14: 0x33333333,
    word18: 0x44444444,
    word1c: 0x0050,
  });

  const missing = await execute({
    kind: "engineOperation",
    semanticId: "resolved-object-tmnm-word-zero-reset",
    arguments: [{ kind: "constant", value: 0, ascii: "NONE" }],
  }, { nativeTmnmRecords: state });
  assert.equal(missing.status, "continued");
  assert.equal(missing.mutation.applied, false);
});

test("applies the exact dialogue TMNM parameter vector after its resource", async () => {
  const state = createNativeTmnmRecordState();
  configureRecord(state);
  const resourceCalls = [];
  const execute = runtime(state, detail => {
    resourceCalls.push({
      ...detail,
      recordBeforeWrites: state.read(detail.objectTag),
    });
  });

  const result = await execute(action(
    "AKIR",
    0x12345678,
    0,
    0x46fffe00,
    0,
    0x3f800000,
    0,
  ));

  assert.equal(result.status, "continued");
  assert.deepEqual(resourceCalls, [{
    objectTag: "AKIR",
    resourceId: 0x12345678,
    recordBeforeWrites: {
      word0c: 0x11111111,
      word10: 0x22222222,
      word14: 0x33333333,
      word18: 0x44444444,
      word1c: 0x0050,
    },
  }]);
  assert.deepEqual(state.read("AKIR"), {
    word0c: 0,
    word10: 0x3f800000,
    word14: 0,
    word18: 0x46fffe00,
    word1c: 0,
  });
});

test("preserves all native float comparison boundaries", async () => {
  const state = createNativeTmnmRecordState();
  configureRecord(state);
  const execute = runtime(state);

  await execute(action(
    "AKIR",
    0,
    0xbf800000,
    0xc0000000,
    0xc0400000,
    0x46fffe00,
    -1,
  ));
  assert.deepEqual(state.read("AKIR"), {
    word0c: 0x11111111,
    word10: 0x22222222,
    word14: 0x33333333,
    word18: 0x44444444,
    word1c: 0x0050,
  });

  await execute(action(
    "AKIR",
    0,
    0,
    0,
    0,
    0x46fffdff,
    -1,
  ));
  assert.equal(state.read("AKIR").word10, 0x46fffdff);
});

test("ORs only the low 16 bits for a positive argument six", async () => {
  const state = createNativeTmnmRecordState();
  configureRecord(state);
  const execute = runtime(state);
  const result = await execute(action(
    "AKIR",
    0,
    0xbf800000,
    0xbf800000,
    0xbf800000,
    0x46fffe00,
    0x1234000f,
  ));

  assert.equal(result.status, "continued");
  assert.equal(state.read("AKIR").word1c, 0x005f);
  assert.deepEqual(result.mutation.writtenFields, ["word1c"]);
});

test("missing resolved objects are native no-ops before resource lookup", async () => {
  const state = createNativeTmnmRecordState();
  let resourceCalls = 0;
  const execute = runtime(state, () => {
    resourceCalls += 1;
  });
  const result = await execute(action(
    "NONE",
    0x1234,
    0,
    0,
    0,
    0,
    0,
  ));

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.applied, false);
  assert.equal(
    result.mutation.reason,
    "resolved-object-or-tmnm-record-unavailable",
  );
  assert.equal(resourceCalls, 0);
});

test("a required missing resource adapter stops before record mutation", async () => {
  const state = createNativeTmnmRecordState();
  configureRecord(state);
  const before = state.read("AKIR");
  const result = await runtime(state)(action(
    "AKIR",
    0x1234,
    0,
    0,
    0,
    0,
    0,
  ));

  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "native-tmnm-resource-adapter-missing");
  assert.deepEqual(state.read("AKIR"), before);
});

test("an unavailable +0x1c word stops positive masks atomically", async () => {
  const state = createNativeTmnmRecordState();
  state.configure({
    objectTag: "AKIR",
    word0c: 1,
    word10: 2,
    word14: 3,
    word18: 4,
  });
  const before = state.read("AKIR");
  const result = await runtime(state)(action(
    "AKIR",
    0,
    0,
    0,
    0,
    0,
    1,
  ));

  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "tmnm-record-word-1c-unavailable");
  assert.deepEqual(state.read("AKIR"), before);
});

test("scene gameplay context owns the exact TMNM record state", async () => {
  const scene = createNativeSceneGameplayState();
  scene.configureObjectTmnmRecord({
    objectTag: "AKIR",
    word0c: 1,
    word10: 2,
    word14: 3,
    word18: 4,
    word1c: 5,
  });
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTmnmRecordSemanticHandlers(),
  });

  assert.equal(
    (await execute(action(
      "AKIR",
      0,
      0,
      0,
      0,
      0x46fffe00,
      0,
    ), context)).status,
    "continued",
  );
  assert.deepEqual(scene.readObjectTmnmRecord("AKIR"), {
    word0c: 0,
    word10: 2,
    word14: 0,
    word18: 0,
    word1c: 0,
  });
});
