import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";

function action(semanticId, arguments_) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId,
    arguments: arguments_.map(value => ({
      kind: "constant",
      value,
    })),
  };
}

function proceduralCreateAction() {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-procedural-model-controller",
    callFileOffset: "0x1556c",
    arguments: [
      { kind: "constant", value: 0 },
      {
        kind: "static-pointer",
        value: 0x21600,
        staticWords: [0x4114cccd, 0xbda3d70a, 0x41300000],
      },
      ...[
        0x22408, 0x22415, 0x22421, 0x2242e, 0x3e800000, 0x1000,
      ].map(value => ({ kind: "constant", value })),
    ],
  };
}

test("room event contexts follow state replaced by native-area activation", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const initialContext = runtime.eventContext();
  const initialBindings = initialContext.nativeOperation013eState;

  runtime.activateArea("TOKI");
  const activeContext = runtime.eventContext();

  assert.notEqual(activeContext.nativeOperation013eState, initialBindings);
  assert.equal(
    activeContext.nativeOperation013eState,
    runtime.sceneState.nativeOperation013eState,
  );
});

test("room script runtime composes exact stateful operation families", async () => {
  const runtime = createNativeRoomScriptRuntime({
    randomFloat: () => 0.5,
  });
  runtime.activateArea("D000");
  runtime.sceneState.configurePrimaryRuntimeState({
    available: true,
    currentEventPresent: true,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });
  assert.equal((await execute(
    action("primary-runtime-state-transition", [0]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.readPrimaryRuntimeState().stateDword20, 2);
  assert.equal((await execute(
    action("global-byte-state-write", [1]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.readGlobalByte(), 1);
  runtime.sceneState.configureNativeObjectDword5c({
    objectTag: "AKIR",
    dword5c: 1,
  });
  assert.equal((await execute(
    action("resolved-object-dword-5c-low-flags-control", [
      0x52494b41,
      1,
    ]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.readNativeObjectDword5c("AKIR").dword5c, 0);
  assert.equal((await execute(
    action("native-operation-0199-control-dword-write", [1, 25]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.nativeOperation0199ControlDword, 25);
  assert.equal((await execute(
    action("native-operation-0174-global-dword-write", [1, 1]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.nativeOperation0174GlobalDword, 1);
  runtime.sceneState.configureNativeOperation01bdGlobalDword(42);
  assert.equal((await execute(
    action("native-operation-01bd-global-dword-consume", [9, 10]),
    runtime.eventContext(),
  )).result, 42);
  assert.equal(runtime.sceneState.nativeOperation01bdGlobalDword, -1);
  assert.equal((await execute(
    action("native-operation-012c-no-op", [1, 2]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal((await execute(
    action("native-operation-0182-no-op", [1, 2, 3]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal((await execute(
    action("native-operation-014f-global-float-word-write", [0x3ecccccd]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.nativeOperation014fGlobalFloatWord, 0x3ecccccd);
  runtime.sceneState.writeObjectVector("LIG7", [0, 0, 0]);
  assert.equal((await execute(
    action("resolved-object-float-word-48-write", [0x3747494c, 0x3f800000]),
    runtime.eventContext(),
  )).status, "continued");
  assert.deepEqual(runtime.sceneState.readObjectVector("LIG7"), [0, 0, 0x3f800000]);
  assert.equal((await execute(
    action("native-operation-0052-indexed-table-write", [0, 32, 89]),
    runtime.eventContext(),
  )).status, "continued");
  assert.equal(runtime.sceneState.nativeOperation0052Table.get(32), 89);
  runtime.sceneState.configureNativeOperation0199StatusByte(0xff);
  assert.equal((await execute(
    action("native-operation-0199-status-byte-query", [2]),
    runtime.eventContext(),
  )).result, -1);
});

test("room script area owns and clears operation 0x018a controller slots", async () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });
  await execute(action("native-operation-018a-primary-initialize", [0, 0x5da8]), runtime.eventContext());
  await execute(action("native-operation-018a-primary-slot-reset", [2, 17]), runtime.eventContext());
  assert.equal(runtime.operation018aState.snapshot().primary.slots[15].word36, 127);
  runtime.deactivateArea("D000");
  assert.equal(runtime.operation018aState.snapshot().primary, null);
});

test("room script context shares one typed presentation-controller adapter", async () => {
  const routes = [];
  const runtime = createNativeRoomScriptRuntime({
    presentationController: {
      applyRoute: detail => {
        routes.push(detail);
        return detail.returnsHandle
          ? { result: 0x44 }
          : { mutation: { appliedMode: detail.mode } };
      },
    },
  });
  runtime.activateArea("OP00");
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });
  const context = runtime.eventContext();

  assert.equal((await execute(
    action("native-operation-0175-control", [15, 0]),
    context,
  )).status, "continued");
  assert.equal((await execute(
    action("native-operation-0176-control", [1, 1]),
    context,
  )).status, "continued");
  assert.equal((await execute(
    action("native-operation-0178-control", [6, 1, 2, 3, 4, 5, 6]),
    context,
  )).result, 0x44);
  assert.equal((await execute(
    action("native-operation-0178-control", [7, 0x44]),
    context,
  )).status, "continued");
  assert.equal((await execute(
    action("native-operation-0179-control", [36, 1, 2, 3, 4, 5, 6]),
    context,
  )).status, "continued");

  assert.deepEqual(routes.map(route => ({
    operationId: route.operationId,
    mode: route.mode,
    area: route.area,
  })), [
    { operationId: 0x0175, mode: 15, area: "OP00" },
    { operationId: 0x0176, mode: 1, area: "OP00" },
    { operationId: 0x0178, mode: 6, area: "OP00" },
    { operationId: 0x0178, mode: 7, area: "OP00" },
    { operationId: 0x0179, mode: 36, area: "OP00" },
  ]);
  assert.deepEqual(routes[2].vectorWordGroups, [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  assert.deepEqual(routes[3].helpers, ["0x0c1bb514", "0x0c1c17d8"]);
});

test("room script transactions own procedural-model state and surface queries", async () => {
  const strings = new Map([
    [0x22408, "model/object"],
    [0x22415, "trlake1.pvr"],
    [0x22421, "model/object"],
    [0x2242e, "trsea025.mt6"],
  ]);
  const pointWords = [0x3f800000, 0x40000000, 0x40400000];
  const queries = [];
  const mutations = [];
  const runtime = createNativeRoomScriptRuntime({
    proceduralModel: {
      querySurfaceHeight: detail => {
        queries.push(detail);
        return -12.875;
      },
      applyMutation: detail => mutations.push(detail),
    },
    context: {
      resolveNativeStaticString: pointer => strings.get(pointer),
      readFrameField: offset => pointWords[(offset - 4) / 4],
    },
  });
  runtime.activateArea("OP00");

  const first = runtime.beginTransaction({ area: "OP00" });
  const executeFirst = createNativeEventOperationExecutor({
    handlers: first.handlers,
  });
  assert.equal((await executeFirst(
    proceduralCreateAction(),
    first.context,
  )).result, 0);
  const queryAction = action(
    "native-procedural-model-controller",
    [18, 0, 0],
  );
  queryAction.arguments[2] = { kind: "frame-address", offset: 4 };
  assert.equal((await executeFirst(queryAction, first.context)).result, -12);
  assert.deepEqual(queries[0].pointWords, pointWords);
  assert.equal(
    runtime.sceneState.nativeProceduralModelControllerState.read(0).model,
    "trsea025.mt6",
  );
  first.rollback({ reason: "world-change" });
  assert.equal(
    runtime.sceneState.nativeProceduralModelControllerState.read(0),
    null,
  );

  const second = runtime.beginTransaction({ area: "OP00" });
  const executeSecond = createNativeEventOperationExecutor({
    handlers: second.handlers,
  });
  assert.equal((await executeSecond(
    proceduralCreateAction(),
    second.context,
  )).result, 0);
  second.commit();
  assert.equal(
    runtime.sceneState.nativeProceduralModelControllerState.read(0).texture,
    "trlake1.pvr",
  );
  assert.equal(mutations.filter(detail => detail.mode === 0).length, 2);
});

test("room script transactions own canonical HNDL/HNDR motion state", async () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("OP00");
  runtime.sceneState.configureObjectHndlHndrControllerRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
    available: true,
    primaryControllerAvailable: true,
    secondaryControllerAvailable: true,
    selectorResults: [{
      selector: 9504,
      matched: true,
      selectedConfigPointer: 0x10203040,
      lengthDword: 12,
      secondaryDword: 7,
    }],
  });

  const first = runtime.beginTransaction({ area: "OP00" });
  const executeFirst = createNativeEventOperationExecutor({
    handlers: first.handlers,
  });
  assert.equal((await executeFirst(action(
    "resolved-object-hndl-hndr-motion-request",
    [0x59524f53, 1, 9504, 0, 0, 0, 0, 0x3f800000, 0],
  ), first.context)).status, "continued");
  assert.equal((await executeFirst(action(
    "resolved-object-hndl-hndr-motion-control",
    [0x59524f53, 1, 0, 1, 4],
  ), first.context)).status, "continued");
  let controller = runtime.sceneState.readObjectHndlHndrRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.motionSelectorWord, 9504);
  assert.equal(controller.flagByte, 4);
  first.rollback({ reason: "cutscene-aborted" });
  controller = runtime.sceneState.readObjectHndlHndrRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.motionSelectorWord, undefined);
  assert.equal(controller.flagByte, undefined);

  const second = runtime.beginTransaction({ area: "OP00" });
  const executeSecond = createNativeEventOperationExecutor({
    handlers: second.handlers,
  });
  assert.equal((await executeSecond(action(
    "resolved-object-hndl-hndr-motion-request",
    [0x59524f53, 1, 9504, 0, 0, 0, 0, 0x3f800000, 0],
  ), second.context)).status, "continued");
  assert.equal((await executeSecond(action(
    "resolved-object-hndl-hndr-motion-control",
    [0x59524f53, 1, 1, 0x41a00000],
  ), second.context)).status, "continued");
  second.commit();
  controller = runtime.sceneState.readObjectHndlHndrRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.motionSelectorWord, 9504);
  assert.equal(controller.stepFloatWord, 0x41a00000);
});

test("room script runtime composes optimized actor look-point updates", async () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("JU00");
  runtime.sceneState.configureActorLookPointState({
    actorTag: "MEGM",
    actorAvailable: true,
    controllerAvailable: true,
    controllerFlagsDword: 0,
    selectorWord: 0x8068,
    defaultVector: [0, 0, 0],
    record: {
      available: true,
      vector: [1, 2, 3],
      selectorWord12: 0x8068,
      selectorWord14: 0x8068,
      activeDword: 1,
      auxiliaryDword: 0,
    },
  });
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });

  const result = await execute(
    action("actor-look-point-update-control", [0x4d47454d, 1, 0, 0]),
    runtime.eventContext(),
  );

  assert.equal(result.status, "continued");
  assert.equal(
    runtime.sceneState.readActorLookPointState("MEGM").record.activeDword,
    1,
  );
});

test("room script runtime composes native object-link preservation", async () => {
  const source = {
    stateA: [1, 2, 3],
    stateB: [4, 5, 6],
    target: null,
  };
  const target = {};
  const objects = { DAKI: source, AKIR: target };
  const reconciled = [];
  const runtime = createNativeRoomScriptRuntime({
    objectLink: {
      resolveNativeObjectLinkObject: objectTag => objects[objectTag],
      captureNativeObjectLinkStateA: object => object.stateA,
      captureNativeObjectLinkStateB: object => object.stateB,
      writeNativeObjectLinkFieldZero: ({ sourceObject, targetObject }) => {
        sourceObject.target = targetObject;
      },
      reconcileNativeObjectLinkStateA: (object, words) => {
        reconciled.push(["A", object, words]);
      },
      reconcileNativeObjectLinkStateB: (object, words) => {
        reconciled.push(["B", object, words]);
      },
    },
  });
  runtime.activateArea("JU00");
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });

  const result = await execute(
    action("resolved-object-link-field-zero-write", [
      0x494b4144,
      0x52494b41,
    ]),
    runtime.eventContext(),
  );

  assert.equal(result.status, "continued");
  assert.equal(source.target, target);
  assert.deepEqual(reconciled, [
    ["A", source, [1, 2, 3]],
    ["B", source, [4, 5, 6]],
  ]);
});

test("room script runtime composes native world-point heading writes", async () => {
  const target = [32, 4, 8].map(nativeFloat32Word);
  const runtime = createNativeRoomScriptRuntime({
    context: {
      readFrameField: offset => target[offset / 4],
    },
  });
  runtime.activateArea("JU00");
  runtime.sceneState.writeObjectVector(
    "AKIR",
    [31, 1, 8].map(nativeFloat32Word),
  );
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });
  const value = action("resolved-object-world-point-heading-write", [
    0x52494b41,
    0x38000000,
    0,
    0,
  ]);
  value.arguments[2] = { kind: "frame-address", offset: 0 };

  const result = await execute(value, runtime.eventContext());

  assert.equal(result.status, "continued");
  assert.deepEqual(
    runtime.sceneState.readObjectSecondaryVector("AKIR"),
    [0, 0xc000, 0],
  );
});

test("room script runtime keeps unavailable native adapters fail closed", async () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const execute = createNativeEventOperationExecutor({
    handlers: runtime.semanticHandlers(),
  });
  assert.deepEqual(await execute(
    action("event-camera-request", [2950, 0, 0]),
    runtime.eventContext(),
  ), {
    status: "stopped",
    reason: "event-camera-adapter-missing",
  });
});

test("room runtime owns exact shared event lifecycle state transactionally", async () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0x0c225251,
    width: 1,
  }), 1);
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0x0c29b134,
    width: 4,
  }), 0xffffffff);
  assert.equal(runtime.sceneState.readMomtNumericGlobalDword(), -1);
  assert.deepEqual(runtime.sceneState.readPrimaryRuntimeState(), {
    available: true,
    currentEventPresent: false,
    gateByte: 0,
    stateDword1f8: 1,
    stateDword20: 0,
    statusByte1d9: 0,
    globalByteB02: 0,
  });
  assert.deepEqual(
    runtime.sceneState.nativeOperation0166State.readControl(),
    {
      modeTwoControlDword: 1,
      modeEightControlDword: 1,
      modeTwoCleanupRequired: false,
    },
  );

  const transaction = runtime.beginTransaction({ area: "D000" });
  assert.equal(
    runtime.sceneState.readPrimaryRuntimeState().currentEventPresent,
    true,
  );
  const execute = createNativeEventOperationExecutor({
    handlers: transaction.handlers,
  });
  assert.equal((await execute(
    action("primary-runtime-state-transition", [0]),
    transaction.context,
  )).status, "continued");
  assert.equal((await execute(
    action("primary-runtime-state-transition", [1]),
    transaction.context,
  )).status, "continued");
  assert.deepEqual(
    runtime.sceneState.readPrimaryRuntimeTransitionCallback(),
    { argument: 1, revision: 1 },
  );
  assert.equal((await execute(
    action("native-operation-0166-control", [8, 1]),
    transaction.context,
  )).result, 1);
  assert.equal((await execute(
    action("native-operation-0166-control", [2, 1]),
    transaction.context,
  )).result, 1);
  assert.equal((await execute(
    action("native-operation-013c-container-control", [0, 2]),
    transaction.context,
  )).result, 0);

  transaction.commit();
  assert.equal(
    runtime.sceneState.readPrimaryRuntimeState().currentEventPresent,
    false,
  );
});

test("room script runtime preserves the exact consumed-selector lifecycle", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });

  assert.deepEqual(runtime.writeSpatialSelection({
    slotIndex: 0,
    selectedRecordIndex: 5,
  }), {
    offset: 0x84,
    width: 4,
    value: 6,
  });
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0x84,
    width: 4,
  }), 6);
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0xb0,
    width: 1,
  }), 3);
  assert.deepEqual(runtime.consumeSpatialSelection({
    slotIndex: 0,
    selectedRecordIndex: 5,
  }), {
    offset: 0x84,
    width: 4,
    previous: 6,
    value: 0xffffffff,
  });
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0x84,
    width: 4,
  }), 0xffffffff);
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0xb0,
    width: 1,
  }), 0);

  runtime.sceneState.writeNativeField({
    offset: 0xb0,
    width: 1,
    value: 1,
  });
  assert.equal(transaction.update(), true);
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0xb0,
    width: 1,
  }), 0);

  transaction.rollback({ reason: "test" });
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0x84,
    width: 4,
  }), undefined);
});

test("room script transactions own native clock writes and restore them on rollback", async () => {
  const authoritative = [86, 11, 29, 6, 9, 30, 0];
  const runtime = createNativeRoomScriptRuntime({
    clockRecord: {
      readNativeClockRecord: () => authoritative,
    },
  });
  runtime.activateArea("OP00");

  const written = [86, 12, 3, 0, 15, 45, 20];
  const writeAction = {
    arguments: [{ kind: "frame-address", offset: 0x20 }],
  };
  const readWrittenByte = offset => written[offset - 0x20];
  const first = runtime.beginTransaction({ area: "OP00" });
  assert.equal((await first.handlers["native-clock-record-write"]({
    action: writeAction,
    context: { readFrameField: readWrittenByte },
  })).status, "continued");
  assert.deepEqual(runtime.clockRecordState.read(), [86, 12, 3, 3, 15, 45, 20]);
  first.rollback({ reason: "test" });
  assert.deepEqual(runtime.clockRecordState.read(), authoritative);

  const second = runtime.beginTransaction({ area: "OP00" });
  assert.equal((await second.handlers["native-clock-record-write"]({
    action: writeAction,
    context: { readFrameField: readWrittenByte },
  })).status, "continued");
  second.commit();
  assert.deepEqual(runtime.clockRecordState.read(), [86, 12, 3, 3, 15, 45, 20]);

  runtime.deactivateArea("OP00");
  runtime.activateArea("OP00");
  assert.deepEqual(runtime.clockRecordState.read(), authoritative);
});

test("room script runtime binds the exact interaction actor position", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });
  const nativePosition = [
    -119.13939666748047,
    0,
    79.6144027709961,
  ];

  assert.deepEqual(runtime.writeInteractionActorPosition(nativePosition), {
    offset: 0xd4,
    width: 4,
    position: nativePosition.map(Math.fround),
    words: nativePosition.map(nativeFloat32Word),
  });
  for (let index = 0; index < nativePosition.length; index += 1) {
    assert.equal(runtime.sceneState.readNativeField({
      offset: 0xd4 + index * 4,
      width: 4,
    }), nativeFloat32Word(nativePosition[index]));
  }

  transaction.rollback({ reason: "test" });
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0xd4,
    width: 4,
  }), undefined);
});

test("room script runtime rejects an unresolved interaction actor position", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  assert.throws(
    () => runtime.writeInteractionActorPosition([1, Number.NaN, 3]),
    /three finite numbers/,
  );
});

test("room script runtime rejects a selector reset without its exact match", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  runtime.writeSpatialSelection({
    slotIndex: 0,
    selectedRecordIndex: 4,
  });
  assert.throws(
    () => runtime.consumeSpatialSelection({
      slotIndex: 0,
      selectedRecordIndex: 5,
    }),
    /expected 6, found 5/,
  );
});

test("room script transactions restore every scene-state family on rollback", () => {
  const lifecycle = [];
  const runtime = createNativeRoomScriptRuntime({
    transaction: {
      begin: detail => {
        lifecycle.push(["begin", detail.interaction]);
        return { cameraMode: 6 };
      },
      rollback: detail => lifecycle.push([
        "rollback",
        detail.reason,
        detail.external.cameraMode,
      ]),
    },
  });
  runtime.activateArea("D000");
  runtime.sceneState.writeGlobalByte(3);
  runtime.sceneState.writeNativeField({
    offset: 0xb0,
    width: 1,
    value: 0,
  });
  runtime.sceneState.configurePrimaryRuntimeState({
    available: true,
    currentEventPresent: true,
    stateDword1f8: 0,
  });
  const transaction = runtime.beginTransaction({
    area: "D000",
    interaction: "HATO",
  });
  runtime.sceneState.writeGlobalByte(9);
  runtime.sceneState.writeNativeField({
    offset: 0xb0,
    width: 1,
    value: 1,
  });
  runtime.sceneState.commitPrimaryRuntimeTransition(
    runtime.sceneState.planPrimaryRuntimeTransition(1),
  );
  transaction.rollback({ reason: "adapter-rejected" });
  assert.equal(runtime.sceneState.readGlobalByte(), 3);
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0xb0,
    width: 1,
  }), 0);
  assert.equal(
    runtime.sceneState.readPrimaryRuntimeState().stateDword1f8,
    0,
  );
  assert.deepEqual(lifecycle, [
    ["begin", "HATO"],
    ["rollback", "adapter-rejected", 6],
  ]);
});

test("room script transactions retain scene state only after commit", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });
  runtime.sceneState.writeGlobalByte(7);
  transaction.commit();
  assert.equal(runtime.sceneState.readGlobalByte(), 7);
  assert.throws(
    () => transaction.rollback({ reason: "late" }),
    /transaction is not active/,
  );
});

test("room script transaction rolls back external AUTH activity ownership", () => {
  const rolledBack = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      rollbackActivity: reason => {
        rolledBack.push(reason);
        return true;
      },
    },
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });
  runtime.sceneState.nativeOperation0050State.start(0, {
    activityId: "DRAUTH/SEQDATA1.AUTH",
    durationFrames: 1330,
  });
  assert.throws(() => transaction.commit(), /AUTH activity is active/);
  transaction.rollback({ reason: "world-change" });
  assert.deepEqual(rolledBack, ["world-change"]);
  assert.equal(runtime.sceneState.readNativeOperation0050Activity(), null);
});

test("room script transactions bracket shared AUTH program ownership", () => {
  const lifecycle = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: detail => {
        lifecycle.push(["begin-program", detail.program.id]);
        return { packageId: "composite" };
      },
      completeProgram: detail => {
        lifecycle.push([
          "complete-program",
          detail.ownership.packageId,
        ]);
        return true;
      },
      rollbackProgram: detail => {
        lifecycle.push([
          "rollback-program",
          detail.reason,
          detail.ownership.packageId,
        ]);
        return true;
      },
    },
  });
  const program = { id: "native-composite" };
  runtime.activateArea("D000");

  runtime.beginTransaction({ area: "D000", program }).commit();
  runtime.beginTransaction({ area: "D000", program }).rollback({
    reason: "world-change",
  });

  assert.deepEqual(lifecycle, [
    ["begin-program", "native-composite"],
    ["complete-program", "composite"],
    ["begin-program", "native-composite"],
    ["rollback-program", "world-change", "composite"],
  ]);
});

test("room script updates its program presentation before other frame owners", () => {
  const lifecycle = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => ({ packageId: "composite" }),
      updateProgram: ({ ownership }) => {
        lifecycle.push(["update-program", ownership.packageId]);
        return true;
      },
      completeProgram: () => true,
      rollbackProgram: () => true,
    },
    transaction: {
      update: () => lifecycle.push(["update-external"]),
    },
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });

  assert.equal(transaction.update(), true);
  transaction.commit();
  assert.deepEqual(lifecycle, [
    ["update-program", "composite"],
    ["update-external"],
  ]);
});

test("room script advances AUTH presentation on the native 30 Hz clock", () => {
  const frames = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      updateActivity: detail => (frames.push(detail.currentFrame), true),
      rollbackActivity: () => true,
    },
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });
  runtime.sceneState.nativeOperation0050State.start(0, {
    activityId: "TGMA/SEQDATA4.AUTH",
    durationFrames: 954,
  });

  for (let renderFrame = 0; renderFrame < 120; renderFrame += 1) {
    transaction.update({ deltaSeconds: 1 / 120 });
  }

  assert.equal(
    runtime.sceneState.readNativeOperation0050Activity().currentFrame,
    30,
  );
  assert.deepEqual(frames, Array.from({ length: 30 }, (_, index) => index + 1));
  transaction.rollback({ reason: "test-complete" });
});

test("room script begin failure unwinds acquired program ownership", () => {
  const lifecycle = [];
  const beginError = new Error("camera transaction unavailable");
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => {
        lifecycle.push("begin-program");
        return { packageId: "composite" };
      },
      rollbackProgram: ({ reason, ownership }) => {
        lifecycle.push(["rollback-program", reason, ownership.packageId]);
        return true;
      },
    },
    transaction: {
      begin: () => {
        lifecycle.push("begin-external");
        throw beginError;
      },
    },
  });
  runtime.activateArea("D000");

  assert.throws(
    () => runtime.beginTransaction({ area: "D000" }),
    error => error === beginError,
  );
  assert.equal(runtime.activeTransaction, null);
  assert.deepEqual(lifecycle, [
    "begin-program",
    "begin-external",
    ["rollback-program", "transaction-begin-failed", "composite"],
  ]);
});

test("room script handler factory failure restores its transaction snapshot", () => {
  const factoryError = new Error("event handlers unavailable");
  const runtime = createNativeRoomScriptRuntime({
    createHandlers: ({ sceneState }) => {
      sceneState.writeGlobalByte(19);
      throw factoryError;
    },
  });
  runtime.activateArea("D000");
  runtime.sceneState.writeGlobalByte(7);

  assert.throws(
    () => runtime.beginTransaction({ area: "D000" }),
    error => error === factoryError,
  );
  assert.equal(runtime.sceneState.readGlobalByte(), 7);
  assert.equal(runtime.activeTransaction, null);
});

test("room script handler factories must settle synchronously", () => {
  const runtime = createNativeRoomScriptRuntime({
    createHandlers: async () => ({}),
  });
  runtime.activateArea("D000");

  assert.throws(
    () => runtime.beginTransaction({ area: "D000" }),
    /handler factories must be synchronous/,
  );
  assert.equal(runtime.activeTransaction, null);
});

test("room script ignores an ownership adapter that acquires no package", () => {
  const lifecycle = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => null,
      completeProgram: () => lifecycle.push("complete-program"),
      rollbackProgram: () => lifecycle.push("rollback-program"),
    },
  });
  runtime.activateArea("D000");

  runtime.beginTransaction({ area: "D000" }).commit();
  runtime.beginTransaction({ area: "D000" }).rollback({ reason: "test" });

  assert.deepEqual(lifecycle, []);
});

test("room script fails closed when program ownership is explicitly rejected", () => {
  const lifecycle = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => false,
      rollbackProgram: () => lifecycle.push("rollback-program"),
    },
    transaction: {
      begin: () => lifecycle.push("begin-external"),
    },
  });
  runtime.activateArea("D000");

  assert.throws(
    () => runtime.beginTransaction({ area: "D000" }),
    /program ownership was rejected/,
  );
  assert.equal(runtime.activeTransaction, null);
  assert.deepEqual(lifecycle, []);
});

test("room script rollback attempts every owner when one adapter fails", () => {
  const lifecycle = [];
  const programError = new Error("package rollback failed");
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => ({ packageId: "composite" }),
      completeProgram: () => true,
      rollbackProgram: () => {
        lifecycle.push("rollback-program");
        throw programError;
      },
    },
    transaction: {
      begin: () => ({ cameraId: 6 }),
      rollback: ({ external }) => {
        lifecycle.push(["rollback-external", external.cameraId]);
        return true;
      },
    },
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });

  assert.throws(
    () => transaction.rollback({ reason: "world-change" }),
    error => error === programError,
  );
  assert.deepEqual(lifecycle, [
    ["rollback-external", 6],
    "rollback-program",
  ]);
  assert.equal(runtime.activeTransaction, null);
});

test("program ownership completes before external commit and is not rolled back twice", () => {
  const lifecycle = [];
  const commitError = new Error("camera commit failed");
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => {
        lifecycle.push("begin-program");
        return { packageId: "composite" };
      },
      completeProgram: () => {
        lifecycle.push("complete-program");
        return true;
      },
      rollbackProgram: () => {
        lifecycle.push("rollback-program");
        return true;
      },
    },
    transaction: {
      begin: () => {
        lifecycle.push("begin-external");
        return { cameraId: 6 };
      },
      commit: () => {
        lifecycle.push("commit-external");
        throw commitError;
      },
      rollback: () => {
        lifecycle.push("rollback-external");
        return true;
      },
    },
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });

  assert.throws(() => transaction.commit(), error => error === commitError);
  assert.equal(runtime.activeTransaction.programOwnershipOpen, false);
  assert.equal(transaction.rollback({ reason: "commit-failed" }), true);
  assert.deepEqual(lifecycle, [
    "begin-program",
    "begin-external",
    "complete-program",
    "commit-external",
    "rollback-external",
  ]);
});

test("program ownership adapters must explicitly accept terminal cleanup", () => {
  const lifecycle = [];
  const runtime = createNativeRoomScriptRuntime({
    operation0050: {
      beginProgram: () => ({ packageId: "composite" }),
      completeProgram: () => undefined,
      rollbackProgram: () => {
        lifecycle.push("rollback-program");
        return true;
      },
    },
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });

  assert.throws(
    () => transaction.commit(),
    /ownership completion was rejected/,
  );
  assert.equal(runtime.activeTransaction.programOwnershipOpen, true);
  assert.equal(transaction.rollback({ reason: "commit-rejected" }), true);
  assert.deepEqual(lifecycle, ["rollback-program"]);
});

test("room script transactions compose current event handler adapters", async () => {
  let marker = 0;
  const runtime = createNativeRoomScriptRuntime({
    createHandlers: ({ actorCode }) => ({
      "event-specific-test": async () => {
        marker += actorCode === "HATO" ? 1 : 100;
        return { status: "continued" };
      },
    }),
  });
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({
    area: "D000",
    actorCode: "HATO",
  });
  const execute = createNativeEventOperationExecutor({
    handlers: transaction.handlers,
  });
  assert.equal((await execute(
    action("event-specific-test", []),
    transaction.context,
  )).status, "continued");
  assert.equal(marker, 1);
  transaction.commit();
});

test("room script runtime clears scene state between native areas", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  runtime.sceneState.writeGlobalByte(7);
  runtime.sceneState.writeNativeField({
    offset: 0xb0,
    width: 1,
    value: 1,
  });

  assert.equal(runtime.deactivateArea("D000"), true);
  assert.equal(runtime.activateArea("JD00"), true);
  assert.equal(runtime.sceneState.readGlobalByte(), 0);
  assert.equal(runtime.sceneState.readNativeField({
    offset: 0xb0,
    width: 1,
  }), undefined);
});

test("room script transactions require the active native area", () => {
  const runtime = createNativeRoomScriptRuntime();
  assert.throws(
    () => runtime.beginTransaction({ area: "D000" }),
    /area D000 is not active/,
  );
  runtime.activateArea("D000");
  assert.throws(
    () => runtime.beginTransaction({ area: "JD00" }),
    /area JD00 is not active/,
  );
});

test("room script area ownership cannot change during a transaction", () => {
  const runtime = createNativeRoomScriptRuntime();
  runtime.activateArea("D000");
  const transaction = runtime.beginTransaction({ area: "D000" });
  assert.throws(
    () => runtime.deactivateArea(),
    /during a transaction/,
  );
  assert.throws(
    () => runtime.activateArea("JD00"),
    /during a transaction/,
  );
  transaction.rollback({ reason: "world-change" });
  assert.equal(runtime.deactivateArea(), true);
});

test("room runtime supplies exact live object vectors to automatic gates", () => {
  const runtime = createNativeRoomScriptRuntime();
  assert.throws(
    () => runtime.writeSceneObjectBasePosition({
      objectTag: "AKIR",
      nativePosition: [1, 2, 3],
    }),
    /area is not active/,
  );
  runtime.activateArea("D000");
  const written = runtime.writeSceneObjectBasePosition({
    objectTag: "AKIR",
    nativePosition: [18.33, 0, 25.47],
  });
  assert.deepEqual(
    written.words.map(nativeFloat32FromWord),
    [Math.fround(18.33), 0, Math.fround(25.47)],
  );
  assert.deepEqual(
    runtime.eventContext().readSceneObjectBaseVector({
      objectTag: "AKIR",
      associated: false,
    }),
    written.words,
  );
});
