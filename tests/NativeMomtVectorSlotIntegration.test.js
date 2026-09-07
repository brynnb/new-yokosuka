import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";

const sourceWords = [0x3f800000, 0x40000000, 0x40400000];

function action(selector = 17, flags = 0x78000000) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "resolved-object-momt-vector-slot-write",
    callFileOffset: "0x9d28",
    arguments: [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value: selector },
      { kind: "static-pointer", value: 0x1000 },
      { kind: "constant", value: flags },
    ],
  };
}

function configure(room) {
  room.sceneState.configureNativeMomtVectorSlotObject({
    objectTag: "AKIR",
    objectAvailable: true,
    momtAvailable: true,
    objectTransformPresent: false,
  });
  room.sceneState.writeNativeVector(0x1000, sourceWords);
}

test("room composition owns MOMT vector slots transactionally", async () => {
  const room = createNativeRoomScriptRuntime();
  room.activateArea("OP00");
  configure(room);

  let transaction = room.beginTransaction({ area: "OP00" });
  let execute = createNativeEventOperationExecutor({
    handlers: transaction.handlers,
  });
  let result = await execute(action(), transaction.context);
  assert.equal(result.status, "continued");
  assert.deepEqual(
    room.sceneState.readNativeMomtVectorSlot("AKIR", 4).words,
    sourceWords,
  );
  transaction.rollback({ reason: "cutscene-cancelled" });
  assert.equal(room.sceneState.readNativeMomtVectorSlot("AKIR", 4), null);

  transaction = room.beginTransaction({ area: "OP00" });
  execute = createNativeEventOperationExecutor({ handlers: transaction.handlers });
  result = await execute(action(), transaction.context);
  assert.equal(result.status, "continued");
  transaction.commit();
  assert.deepEqual(
    room.sceneState.readNativeMomtVectorSlot("AKIR", 4).words,
    sourceWords,
  );
});

test("room composition supplies the object affine-transform adapter", async () => {
  const transformedWords = [0x40800000, 0x40a00000, 0x40c00000];
  const transforms = [];
  const room = createNativeRoomScriptRuntime({
    momtVectorSlot: {
      transformNativeObjectPointWords(detail) {
        transforms.push(detail);
        return transformedWords;
      },
    },
  });
  room.activateArea("OP00");
  room.sceneState.configureNativeMomtVectorSlotObject({
    objectTag: "AKIR",
    objectAvailable: true,
    momtAvailable: true,
    objectTransformPresent: true,
  });
  room.sceneState.writeNativeVector(0x1000, sourceWords);
  const transaction = room.beginTransaction({ area: "OP00" });
  const execute = createNativeEventOperationExecutor({
    handlers: transaction.handlers,
  });

  const result = await execute(action(11, 0x38000000), transaction.context);
  assert.equal(result.status, "continued");
  assert.deepEqual(transforms, [{
    objectTag: "AKIR",
    words: sourceWords,
    source: { functionFileOffset: undefined, callFileOffset: "0x9d28" },
  }]);
  assert.deepEqual(
    room.sceneState.readNativeMomtVectorSlot("AKIR", 3).words,
    transformedWords,
  );
  transaction.commit();
});
