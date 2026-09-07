import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeCoroutineSemanticHandlers,
  createNativeDialogueChannelSemanticHandlers,
  createNativeEventOperationExecutor,
  createNativeGlobalWordSemanticHandlers,
  createNativeInteractionRecordSemanticHandlers,
  createNativeNamedResourceSemanticHandlers,
  createNativeNumericSemanticHandlers,
  createNativeSceneObjectSemanticHandlers,
  createNativeSceneTransitionSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  nativeBinaryAngleFromFloatPairWords,
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";

function action(semanticId, arguments_) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId,
    callFileOffset: "0x104",
    arguments: arguments_,
  };
}

test("native float-pair angles retain exact quadrants and scale", () => {
  const angle = (first, second) => nativeBinaryAngleFromFloatPairWords(
    nativeFloat32Word(first),
    nativeFloat32Word(second),
  );
  assert.deepEqual([
    angle(0, 0),
    angle(1, 0),
    angle(-1, 0),
    angle(0, 1),
    angle(0, -1),
    angle(1, 1),
    angle(1, -1),
    angle(-1, 1),
    angle(-1, -1),
  ], [0, 0xc000, 0x4000, 0x8000, 0, 0xa000, 0xe000, 0x6000, 0x2000]);
  assert.equal(angle(2, 1), 0xad1c);
  assert.equal(angle(0.5, 0.25), 0xad1c);
});

test("executes proven numeric modes and writes exact operation results", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeNumericSemanticHandlers({
      randomFloat: () => 0.75,
      readVector3: ({ operand }) => (
        operand.value === 1
          ? [0x00000000, 0x00000000, 0x00000000]
          : [0x40400000, 0x40800000, 0x00000000]
      ),
    }),
  });
  assert.deepEqual(await execute(action(
    "float-to-integer-truncation",
    [
      { kind: "constant", value: 4 },
      { kind: "constant", value: 0xc0700000 },
    ],
  )), { result: -3 });
  assert.deepEqual(await execute(action(
    "binary-angle-from-float-pair",
    [
      { kind: "constant", value: 5 },
      { kind: "constant", value: 0x3f800000 },
      { kind: "constant", value: 0x3f000000 },
    ],
  )), { result: 0xad1c });
  assert.deepEqual(await execute(action(
    "signed-integer-to-float",
    [
      { kind: "constant", value: 8 },
      { kind: "constant", value: -3 },
    ],
  )), { result: 0xc0400000 });
  assert.deepEqual(await execute(action(
    "binary-angle-sine",
    [
      { kind: "constant", value: 10 },
      { kind: "constant", value: 0x4000 },
    ],
  )), { result: 0x3f800000 });
  assert.deepEqual(await execute(action(
    "binary-angle-cosine",
    [
      { kind: "constant", value: 11 },
      { kind: "constant", value: 0x8000 },
    ],
  )), { result: 0xbf800000 });
  assert.deepEqual(await execute(action(
    "float-square-root",
    [
      { kind: "constant", value: 12 },
      { kind: "constant", value: 0x41100000 },
    ],
  )), { result: 0x40400000 });
  assert.deepEqual(await execute(action(
    "float-absolute-value",
    [
      { kind: "constant", value: 13 },
      { kind: "constant", value: 0xc0700000 },
    ],
  )), { result: 0x40700000 });
  assert.deepEqual(await execute(action(
    "two-dimensional-xz-distance",
    [
      { kind: "constant", value: 14 },
      { kind: "constant", value: 1 },
      { kind: "constant", value: 2 },
    ],
  )), { result: 0x40400000 });
  assert.deepEqual(await execute(action(
    "three-dimensional-distance",
    [
      { kind: "constant", value: 15 },
      { kind: "constant", value: 1 },
      { kind: "constant", value: 2 },
    ],
  )), { result: 0x40a00000 });
  assert.deepEqual(await execute(action(
    "scaled-uniform-random-float",
    [
      { kind: "constant", value: 16 },
      { kind: "constant", value: 0x40400000 },
    ],
  )), { result: 0x40100000 });
  assert.deepEqual(await execute(action(
    "bounded-random-integer",
    [
      { kind: "constant", value: 6 },
      { kind: "constant", value: 4 },
    ],
  )), { result: 3 });
});

test("passes exact dialogue resource provenance and channel handles", async () => {
  const handle = { channel: 1 };
  const handlers = createNativeDialogueChannelSemanticHandlers({
    startDialogue: detail => {
      assert.equal(detail.resourcePointer, 0x1234);
      assert.deepEqual(detail.dialogueRegion.voiceIds, ["E1004AA004"]);
      return {
        handle,
        request: { kind: "dialogue", voiceIds: detail.dialogueRegion.voiceIds },
      };
    },
    isDialogueActive: value => value === handle,
  });
  const execute = createNativeEventOperationExecutor({ handlers });
  const context = {
    functionDefinition: {
      dialogueRegion: { voiceIds: ["E1004AA004"] },
    },
    location: { functionId: "0x100" },
    readFrameField: () => handle,
  };
  const started = await execute(action("dialogue-start", [{
    kind: "static-pointer",
    value: 0x1234,
  }]), context);
  assert.deepEqual(started, {
    status: "yielded",
    request: { kind: "dialogue", voiceIds: ["E1004AA004"] },
    result: handle,
  });
  assert.deepEqual(await execute(action("dialogue-active-query", [{
    kind: "frame-field",
    offset: 8,
  }]), context), { result: 1 });
});

test("deactivates an exact child or the current coroutine record", async () => {
  const requests = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeCoroutineSemanticHandlers({
      deactivateCoroutine: (request) => {
        requests.push(request);
        return request.current;
      },
    }),
  });
  const context = { location: { functionId: "0x100" } };
  assert.deepEqual(await execute(action(
    "coroutine-deactivate-request",
    [{ kind: "constant", value: 0 }],
  ), context), { result: 1 });
  assert.deepEqual(await execute(action(
    "coroutine-deactivate-request",
    [{ kind: "frame-field", offset: 8 }],
  ), {
    ...context,
    readFrameField: () => ({ eventRecord: 7 }),
  }), { result: 0 });
  assert.deepEqual(requests, [
    {
      handle: null,
      current: true,
      currentHandle: null,
      source: {
        functionFileOffset: "0x100",
        callFileOffset: "0x104",
      },
    },
    {
      handle: { eventRecord: 7 },
      current: false,
      currentHandle: null,
      source: {
        functionFileOffset: "0x100",
        callFileOffset: "0x104",
      },
    },
  ]);
});

test("writes the seven proven native interaction-record fields", async () => {
  const updates = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeInteractionRecordSemanticHandlers({
      updateInteractionRecord: update => updates.push(update),
    }),
  });
  const result = await execute(action(
    "interaction-record-fields-write",
    Array.from({ length: 8 }, (_, value) => ({
      kind: "constant",
      value,
    })),
  ), {
    location: { functionId: "0x200" },
  });
  assert.deepEqual(result, { status: "continued" });
  assert.deepEqual(updates, [{
    index: 0,
    values: [1, 2, 3, 4, 5, 6, 7],
    source: {
      functionFileOffset: "0x200",
      callFileOffset: "0x104",
    },
  }]);
});

test("writes and clears exact native interaction context word 56", async () => {
  const values = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeInteractionRecordSemanticHandlers({
      writeInteractionContextWord56: value => values.push(value),
    }),
  });
  assert.deepEqual(await execute(action(
    "interaction-context-word-56-set",
    [{ kind: "constant", value: 1 }],
  )), { status: "continued" });
  assert.deepEqual(await execute(action(
    "interaction-context-word-56-clear",
    [{ kind: "constant", value: 12 }],
  )), { status: "continued" });
  assert.deepEqual(values, [1, 0]);
});

test("queries the exact native interaction-manager indirect index", async () => {
  const queries = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeInteractionRecordSemanticHandlers({
      queryInteractionManagerIndirectIndex(descriptorIndex, key) {
        queries.push({ descriptorIndex, key });
        return 41;
      },
    }),
  });
  assert.deepEqual(await execute(action(
    "interaction-manager-indirect-index-query",
    [
      { kind: "constant", value: 3 },
      { kind: "constant", value: 7 },
      { kind: "constant", value: 2 },
    ],
  )), { result: 41 });
  assert.deepEqual(queries, [{ descriptorIndex: 7, key: 2 }]);

  const unavailable = createNativeEventOperationExecutor({
    handlers: createNativeInteractionRecordSemanticHandlers({
      queryInteractionManagerIndirectIndex: () => undefined,
    }),
  });
  assert.equal((await unavailable(action(
    "interaction-manager-indirect-index-query",
    [
      { kind: "constant", value: 3 },
      { kind: "constant", value: 7 },
      { kind: "constant", value: 2 },
    ],
  ))).reason, "interaction-manager-state-unavailable");
});

test("allocates and consumes exact native interaction-manager runtime slots", async () => {
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeInteractionRecordSemanticHandlers({
      queryNearestInteractionManagerDescriptor(targetWords, key) {
        calls.push(["nearest", targetWords, key]);
        return 2;
      },
      allocateInteractionManagerRuntimeSlot(firstWord, secondWord) {
        calls.push(["allocate", firstWord, secondWord]);
        return 4;
      },
      consumeInteractionManagerRuntimeSlotStatus(index) {
        calls.push(["consume", index]);
        return -2;
      },
    }),
  });
  assert.deepEqual(await execute(action(
    "interaction-manager-nearest-descriptor-query",
    [
      { kind: "constant", value: 5 },
      {
        kind: "static-pointer",
        value: 0x100,
        staticWords: [0x3f800000, 0, 0xbf800000],
      },
    ],
  )), { result: 2 });
  assert.deepEqual(await execute(action(
    "interaction-manager-runtime-slot-allocate",
    [
      { kind: "constant", value: 6 },
      { kind: "constant", value: 17 },
      { kind: "constant", value: 23 },
    ],
  )), { result: 4 });
  assert.deepEqual(await execute(action(
    "interaction-manager-runtime-slot-status-consume",
    [
      { kind: "constant", value: 13 },
      { kind: "constant", value: 4 },
    ],
  )), { result: -2 });
  assert.deepEqual(calls, [
    ["nearest", [0x3f800000, 0, 0xbf800000], 2],
    ["allocate", 17, 23],
    ["consume", 4],
  ]);
});

test("stops explicitly when a proven semantic has no runtime handler", async () => {
  const execute = createNativeEventOperationExecutor();
  assert.deepEqual(await execute(action("camera-state-mode-select", [])), {
    status: "stopped",
    reason: "semantic-handler-missing:camera-state-mode-select",
  });
});

test("queries exact native scene-object tags", async () => {
  const seen = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneObjectSemanticHandlers({
      hasSceneObject: (objectTag) => {
        seen.push(objectTag);
        return objectTag === "AKIR";
      },
    }),
  });
  const result = await execute(action("scene-object-exists-query", [
    { kind: "constant", value: 1 },
    {
      kind: "constant",
      value: 0x52494b41,
      ascii: "AKIR",
    },
  ]));
  assert.deepEqual(result, { result: 1 });
  assert.deepEqual(seen, ["AKIR"]);
});

test("queries, sets, and clears exact resolved-object flags", async () => {
  const runtimeFlags = new Map();
  const presentationFlags = new Map();
  const handlers = createNativeSceneObjectSemanticHandlers({
    hasSceneObject: objectTag => (
      ["AKIR", "YKUR"].includes(objectTag)
    ),
    readObjectRuntimeFlag: objectTag => (
      runtimeFlags.get(objectTag) ?? false
    ),
    writeObjectRuntimeFlag: (objectTag, enabled) => {
      runtimeFlags.set(objectTag, enabled);
    },
    readObjectPresentationFlag: objectTag => (
      presentationFlags.get(objectTag) ?? false
    ),
    writeObjectPresentationFlag: (objectTag, enabled) => {
      presentationFlags.set(objectTag, enabled);
    },
  });
  const execute = createNativeEventOperationExecutor({ handlers });
  const flagAction = (semanticId, objectTag, mode) => action(semanticId, [
    {
      kind: "constant",
      value: [...objectTag].reduce(
        (word, character, index) => (
          word | (character.charCodeAt(0) << (index * 8))
        ),
        0,
      ) >>> 0,
      ascii: objectTag,
    },
    { kind: "constant", value: mode },
  ]);

  assert.equal((await execute(flagAction(
    "resolved-object-runtime-flag",
    "AKIR",
    0,
  ))).result, 0);
  assert.equal((await execute(flagAction(
    "resolved-object-runtime-flag",
    "AKIR",
    1,
  ))).result, 1);
  assert.equal(runtimeFlags.get("AKIR"), true);
  assert.equal((await execute(flagAction(
    "resolved-object-runtime-flag",
    "AKIR",
    2,
  ))).result, 0);
  assert.equal(runtimeFlags.get("AKIR"), false);

  assert.equal((await execute(flagAction(
    "resolved-object-presentation-flag",
    "YKUR",
    1,
  ))).status, "continued");
  assert.equal(presentationFlags.get("YKUR"), true);
  assert.equal((await execute(flagAction(
    "resolved-object-presentation-flag",
    "YKUR",
    0,
  ))).status, "continued");
  assert.equal(presentationFlags.get("YKUR"), false);
  assert.deepEqual(await execute(flagAction(
    "resolved-object-presentation-flag",
    "NONE",
    1,
  )), {
    status: "stopped",
    reason: "scene-object-unavailable:NONE",
  });
  assert.deepEqual(await execute(flagAction(
    "resolved-object-runtime-flag",
    "AKIR",
    3,
  )), {
    status: "stopped",
    reason: "scene-object-flag-mode-unhandled:3",
  });
});

test("executes exact resolved-object vector initialization flags", async () => {
  const seen = [];
  const vectors = new Map([[
    0x2000,
    [0x3f800000, 0x40000000, 0x40400000],
  ]]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneObjectSemanticHandlers({
      readNativeVector: pointer => vectors.get(pointer),
      initializeSceneObjectVector: detail => seen.push(detail),
    }),
  });
  assert.deepEqual(await execute(action(
    "resolved-object-vector-initialize",
    [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: "AKIR",
      },
      { kind: "constant", value: 0x78000000 },
      { kind: "static-pointer", value: 0x2000 },
    ],
  ), {
    location: { functionId: "0x100" },
  }), { status: "continued" });
  assert.deepEqual(seen, [{
    objectTag: "AKIR",
    flags: 0x78000000,
    vector: [0x3f800000, 0x40000000, 0x40400000],
    vectorPointer: 0x2000,
    associated: true,
    composition: "add",
    componentMask: { x: true, y: true, z: true },
    source: {
      functionFileOffset: "0x100",
      callFileOffset: "0x104",
    },
  }]);
});

test("reads resolved-object initialization vectors from the current frame", async () => {
  const seen = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneObjectSemanticHandlers({
      readNativeVector() {
        throw new Error("frame-address vector must not use native memory");
      },
      initializeSceneObjectVector: detail => seen.push(detail),
    }),
  });
  const frame = new Map([
    [4, 0x3f800000],
    [8, 0x40000000],
    [12, 0x40400000],
  ]);
  const result = await execute(action(
    "resolved-object-vector-initialize",
    [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value: 0x38000000 },
      { kind: "frame-address", offset: 4 },
    ],
  ), {
    location: { functionId: "0x100" },
    readFrameField: offset => frame.get(offset),
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(seen, [{
    objectTag: "AKIR",
    flags: 0x38000000,
    vector: [0x3f800000, 0x40000000, 0x40400000],
    frameVectorOffset: 4,
    associated: false,
    composition: "add",
    componentMask: { x: true, y: true, z: true },
    source: {
      functionFileOffset: "0x100",
      callFileOffset: "0x104",
    },
  }]);
});

test("copies an exact direct or associated base object vector", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneObjectSemanticHandlers({
      readSceneObjectBaseVector: ({ associated }) => (
        associated
          ? [0x40800000, 0x40a00000, 0x40c00000]
          : [0x3f800000, 0x40000000, 0x40400000]
      ),
      writeNativeVector: (destination, vector) => {
        writes.push({ destination, vector });
      },
    }),
  });
  assert.deepEqual(await execute(action(
    "resolved-object-base-vector-query",
    [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: "AKIR",
      },
      { kind: "constant", value: 0xffffffff },
      { kind: "frame-field", offset: 20 },
      { kind: "constant", value: 0x40000000 },
    ],
  ), {
    readFrameField: () => 0x3000,
  }), { status: "continued" });
  assert.deepEqual(writes, [{
    destination: 0x3000,
    vector: [0x40800000, 0x40a00000, 0x40c00000],
  }]);
});

test("copies a base object vector into an exact native frame address", async () => {
  const frame = new Map();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneObjectSemanticHandlers({
      readSceneObjectBaseVector: () => [
        0x3f800000,
        0x40000000,
        0x40400000,
      ],
    }),
  });
  assert.deepEqual(await execute(action(
    "resolved-object-base-vector-query",
    [
      { kind: "constant", value: 0x314b4254, ascii: "TBK1" },
      { kind: "constant", value: 0xffffffff },
      { kind: "frame-address", offset: 8 },
      { kind: "constant", value: 0 },
    ],
  ), {
    writeFrameField: ({ offset, value }) => frame.set(offset, value),
  }), { status: "continued" });
  assert.deepEqual([...frame], [
    [8, 0x3f800000],
    [12, 0x40000000],
    [16, 0x40400000],
  ]);
});

test("sets and clears only exact global runtime word bit 5", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGlobalWordSemanticHandlers({
      writeNativeWordBit: detail => writes.push(detail),
    }),
  });
  assert.deepEqual(await execute(action(
    "global-runtime-word-bit-5-control",
    [{ kind: "constant", value: 0 }],
  ), {
    location: { functionId: "0x100" },
  }), { status: "continued" });
  assert.deepEqual(await execute(action(
    "global-runtime-word-bit-5-control",
    [{ kind: "constant", value: 1 }],
  ), {
    location: { functionId: "0x100" },
  }), { status: "continued" });
  assert.deepEqual(writes.map(({ address, mask, enabled }) => ({
    address,
    mask,
    enabled,
  })), [
    { address: 0x0c20c3d4, mask: 0x20, enabled: true },
    { address: 0x0c20c3d4, mask: 0x20, enabled: false },
  ]);
});

test("copies exact authored float words into the fixed global vector", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGlobalWordSemanticHandlers({
      writeNativeField: detail => writes.push(detail),
    }),
  });
  const result = await execute(action(
    "fixed-global-float4-copy",
    [{
      kind: "static-pointer",
      value: 0xb15a8,
      staticWords: [0x3f800000, 0x3e4ccccd, 0x3e4ccccd, 0x3e4ccccd],
    }],
  ));
  assert.equal(result.status, "continued");
  assert.deepEqual(writes, [
    { offset: 0x0c220330, width: 4, value: 0x3f800000 },
    { offset: 0x0c220334, width: 4, value: 0x3e4ccccd },
    { offset: 0x0c220338, width: 4, value: 0x3e4ccccd },
    { offset: 0x0c22033c, width: 4, value: 0x3e4ccccd },
  ]);
});

test("returns exact signed global-word quotient and remainder by ten", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGlobalWordSemanticHandlers({
      readNativeField: ({ offset, width }) => {
        assert.equal(offset, 0x0c22020c);
        assert.equal(width, 2);
        return 0xff85;
      },
    }),
  });
  assert.deepEqual(await execute(action(
    "global-signed-word-divmod-10-query",
    [
      { kind: "constant", value: 0 },
      { kind: "constant", value: 0 },
    ],
  )), { result: -3 });
  assert.deepEqual(await execute(action(
    "global-signed-word-divmod-10-query",
    [
      { kind: "constant", value: 1 },
      { kind: "constant", value: 0 },
    ],
  )), { result: -12 });
});

test("writes exact operation-0x0116 selector global dwords", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGlobalWordSemanticHandlers({
      writeNativeField: detail => writes.push(detail),
    }),
  });
  assert.deepEqual(await execute(action(
    "fixed-global-dword-write",
    [
      { kind: "constant", value: 4 },
      { kind: "constant", value: 0xffffffff },
    ],
  )), {
    result: -1,
    mutation: {
      address: 0x0c22478c,
      width: 4,
      value: 0xffffffff,
    },
  });
  assert.deepEqual(await execute(action(
    "fixed-global-dword-write",
    [
      { kind: "constant", value: 5 },
      { kind: "constant", value: 0x534b484b },
    ],
  )), {
    result: -1,
    mutation: {
      address: 0x0c22483c,
      width: 4,
      value: 0x534b484b,
    },
  });
  assert.deepEqual(writes, [
    { offset: 0x0c22478c, width: 4, value: 0xffffffff },
    { offset: 0x0c22483c, width: 4, value: 0x534b484b },
  ]);
});

test("loads and releases exact native named-resource operands", async () => {
  const events = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeNamedResourceSemanticHandlers({
      loadNamedResource: async (resource) => {
        events.push(["load", resource]);
        return true;
      },
      releaseNamedResource: (resource) => {
        events.push(["release", resource]);
      },
    }),
  });
  assert.deepEqual(await execute(action(
    "named-resource-residency-control",
    [
      { kind: "constant", value: 1 },
      { kind: "static-pointer", value: 0x2000 },
    ],
  )), { result: 1 });
  assert.deepEqual(await execute(action(
    "named-resource-residency-control",
    [
      { kind: "constant", value: 0 },
      { kind: "frame-field", offset: 12 },
    ],
  ), {
    readFrameField: () => 0x3000,
  }), { result: 1 });
  assert.deepEqual(events, [
    ["load", 0x2000],
    ["release", 0x3000],
  ]);
});

test("writes and queries the exact neutral eight-channel transition", async () => {
  const writes = [];
  let active = false;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneTransitionSemanticHandlers({
      writeSceneEightChannelTransition: detail => {
        writes.push(detail);
        active = Boolean(detail.duration);
      },
      isSceneEightChannelTransitionActive: () => active,
    }),
  });
  assert.deepEqual(await execute(action(
    "scene-eight-channel-transition-write",
    [
      { kind: "constant", value: 30 },
      ...Array.from({ length: 8 }, (_, value) => ({
        kind: "constant",
        value,
      })),
    ],
  ), {
    location: { functionId: "0x100" },
  }), { status: "continued" });
  assert.deepEqual(writes[0].endpoints, [[0, 1, 2, 3], [4, 5, 6, 7]]);
  assert.equal(writes[0].duration, 30);
  assert.deepEqual(await execute(action(
    "scene-eight-channel-transition-active-query",
    [{ kind: "constant", value: 0xffffffff }],
  )), { result: 1 });
});
