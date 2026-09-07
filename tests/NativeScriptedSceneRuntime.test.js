import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeFreeConversationState,
  createNativeScriptedSceneSemanticHandlers,
} from "../play/events/NativeScriptedSceneRuntime.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";

function invocation(arguments_, context = {}) {
  return {
    action: {
      arguments: arguments_,
      callFileOffset: "0x100",
    },
    context: {
      location: { functionId: "0x80" },
      ...context,
    },
    readArgument: index => arguments_[index].value,
  };
}

test("sound commands preserve all three native words and return value", async () => {
  const calls = [];
  const handlers = createNativeScriptedSceneSemanticHandlers({
    dispatchSoundCommand: detail => {
      calls.push(detail);
      return 7;
    },
  });
  const result = await handlers["sound-command-dispatch"](invocation([
    { kind: "constant", value: 0x006805a9 },
    { kind: "constant", value: 0 },
    { kind: "constant", value: 0 },
  ]));
  assert.deepEqual(result, { result: 7 });
  assert.deepEqual(calls, [{
    arguments: [0x006805a9, 0, 0],
    source: {
      functionFileOffset: "0x80",
      callFileOffset: "0x100",
    },
  }]);
});

test("native actor motion requests retain exact actor, request, and floats", async () => {
  let received;
  const handlers = createNativeScriptedSceneSemanticHandlers({
    requestActorMotion: detail => {
      received = detail;
      return true;
    },
  });
  const result = await handlers["actor-motion-request"](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 903 },
    { kind: "constant", value: nativeFloat32Word(-1) },
    { kind: "constant", value: nativeFloat32Word(-1) },
    { kind: "constant", value: nativeFloat32Word(-1) },
    { kind: "constant", value: nativeFloat32Word(1) },
  ]));
  assert.equal(result.status, "continued");
  assert.deepEqual(received, {
    actorCode: "AKIR",
    request: 903,
    parameters: [-1, -1, -1, 1],
    source: {
      functionFileOffset: "0x80",
      callFileOffset: "0x100",
    },
  });
});

test("native actor status exposes only exact controller bit 1", async () => {
  const handlers = createNativeScriptedSceneSemanticHandlers({
    readActorMotionStatus: ({ actorCode }) => (
      actorCode === "AKIR" ? 0xffffffff : undefined
    ),
  });
  const result = await handlers[
    "actor-motion-status-bit-1-query"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
  ]));
  assert.equal(result.result, 2);
});

test("actor controller status forwards only the two proven selectors", async () => {
  const calls = [];
  const handlers = createNativeScriptedSceneSemanticHandlers({
    readActorControllerStatus: (detail) => {
      calls.push(detail);
      return detail.selector === 1 ? 2 : -1;
    },
  });
  const result = await handlers[
    "actor-controller-status-query"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 1 },
    { kind: "constant", value: 0 },
  ]));

  assert.equal(result.result, 2);
  assert.deepEqual(calls, [{ actorCode: "AKIR", selector: 1 }]);
});

test("an unconsumed actor controller query may preserve an unavailable result", async () => {
  const handlers = createNativeScriptedSceneSemanticHandlers();
  const result = await handlers[
    "actor-controller-status-query"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0 },
    { kind: "constant", value: 0 },
  ]));
  assert.deepEqual(result, {
    status: "continued",
    resultUnavailable: "actor-controller-status-adapter-missing",
  });
});

test("actor controller bit 3 control retains exact identity and mode", async () => {
  let received;
  const handlers = createNativeScriptedSceneSemanticHandlers({
    writeActorControllerFlagBit3: (detail) => {
      received = detail;
      return true;
    },
  });
  const result = await handlers[
    "actor-controller-flag-bit-3-control"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0 },
  ]));

  assert.equal(result.status, "continued");
  assert.deepEqual(received, {
    actorCode: "AKIR",
    enabled: false,
    source: {
      functionFileOffset: "0x80",
      callFileOffset: "0x100",
    },
  });
});

test("conditional global byte writes obey the exact native gate", async () => {
  const fields = new Map([[0x0c225251, 1]]);
  const handlers = createNativeScriptedSceneSemanticHandlers();
  const context = {
    readSceneField: ({ offset }) => fields.get(offset),
    writeSceneField: ({ offset, value }) => fields.set(offset, value),
  };

  const result = await handlers[
    "conditional-global-byte-write"
  ](invocation([{ kind: "constant", value: 0x100 }], context));

  assert.deepEqual(result.mutation, { applied: true, value: 0 });
  assert.equal(fields.get(0x0c225250), 0);
});

test("XMPT requests retain exact target and controller request fields", async () => {
  let received;
  const fields = new Map([
    [4, nativeFloat32Word(-121.16000366210938)],
    [8, nativeFloat32Word(-1.7999999523162842)],
    [12, nativeFloat32Word(77.94000244140625)],
  ]);
  const handlers = createNativeScriptedSceneSemanticHandlers({
    requestActorXmpt: detail => {
      received = detail;
      return true;
    },
  });
  const result = await handlers["actor-xmpt-request"](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "frame-address", offset: 4, value: 0 },
    { kind: "constant", value: 42143 },
    { kind: "constant", value: 0x8000055e },
    { kind: "constant", value: 0 },
  ], {
    readFrameField: offset => fields.get(offset),
  }));
  assert.equal(result.status, "continued");
  assert.deepEqual(received, {
    actorCode: "AKIR",
    target: [
      -121.16000366210938,
      -1.7999999523162842,
      77.94000244140625,
    ],
    requestWord: 42143,
    requestDword: 0x8000055e,
    stateSelector: 0,
    source: {
      functionFileOffset: "0x80",
      callFileOffset: "0x100",
    },
  });

  const unsupported = await handlers["actor-xmpt-request"](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "frame-address", offset: 4, value: 0 },
    { kind: "constant", value: 42143 },
    { kind: "constant", value: 0x8000055e },
    { kind: "constant", value: 1 },
  ], {
    readFrameField: offset => fields.get(offset),
  }));
  assert.equal(
    unsupported.reason,
    "actor-xmpt-supplemental-record-unimplemented",
  );
});

test("XMPT state-zero query preserves the exact native boolean", async () => {
  const handlers = createNativeScriptedSceneSemanticHandlers({
    readActorXmptStateZero: ({ actorCode }) => actorCode === "AKIR",
  });
  const result = await handlers[
    "actor-xmpt-state-zero-query"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
  ]));
  assert.equal(result.result, 1);
});

test("XMPT selector-five query uses authoritative scene state", async () => {
  const queries = [];
  const handlers = createNativeScriptedSceneSemanticHandlers();
  const result = await handlers[
    "actor-xmpt-selector-five-active-query"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
  ], {
    readActorXmptSelectorActive(actorTag, selector) {
      queries.push({ actorTag, selector });
      return true;
    },
  }));
  assert.deepEqual(result, { result: 1 });
  assert.deepEqual(queries, [{ actorTag: "AKIR", selector: 5 }]);
});

test("XMPT selector-five requests retain their exact four authored fields", async () => {
  let received;
  const fields = new Map([
    [20, nativeFloat32Word(4.25)],
    [24, nativeFloat32Word(-2.5)],
    [28, nativeFloat32Word(9.75)],
  ]);
  const handlers = createNativeScriptedSceneSemanticHandlers({
    requestActorXmpt: detail => {
      received = detail;
      return true;
    },
  });
  const result = await handlers[
    "actor-xmpt-selector-five-request"
  ](invocation([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "frame-address", offset: 20, value: 0 },
    { kind: "constant", value: 0x8000 },
    { kind: "constant", value: 89 },
  ], {
    readFrameField: offset => fields.get(offset),
  }));
  assert.equal(result.status, "continued");
  assert.deepEqual(received, {
    actorCode: "AKIR",
    target: [4.25, -2.5, 9.75],
    requestWord: 0x8000,
    requestDword: 89,
    stateSelector: 5,
    source: {
      functionFileOffset: "0x80",
      callFileOffset: "0x100",
    },
  });
});

test("look-point frame addresses materialize exact float vectors", async () => {
  let received;
  const fields = new Map([
    [8, nativeFloat32Word(1.25)],
    [12, nativeFloat32Word(2.5)],
    [16, nativeFloat32Word(-3.75)],
  ]);
  const handlers = createNativeScriptedSceneSemanticHandlers({
    controlActorLookPoint: detail => {
      received = detail;
      return true;
    },
  });
  const result = await handlers["actor-look-point-control"](invocation([
    { kind: "constant", value: 0x4f544148, ascii: "HATO" },
    { kind: "constant", value: 15 },
    { kind: "frame-address", offset: 8, value: 0 },
    { kind: "constant", value: 0 },
  ], {
    readFrameField: offset => fields.get(offset),
  }));
  assert.equal(result.status, "continued");
  assert.deepEqual(received.target, [1.25, 2.5, -3.75]);
  assert.equal(received.selector, 15);
});

test("global byte writes retain the exact low byte and source", async () => {
  let received;
  const handlers = createNativeScriptedSceneSemanticHandlers({
    writeGlobalByteState: detail => {
      received = detail;
      return true;
    },
  });
  const result = await handlers["global-byte-state-write"](invocation([
    { kind: "constant", value: 0x101 },
  ]));
  assert.equal(result.status, "continued");
  assert.deepEqual(received, {
    value: 1,
    source: {
      functionFileOffset: "0x80",
      callFileOffset: "0x100",
    },
  });
});

test("free-conversation state preserves native state-bank reads and writes", () => {
  const values = new Map([
    ["2:100", 7],
    ["3:12", 8],
    ["4:197", 9],
  ]);
  const state = createNativeFreeConversationState({
    dialogueState: {
      read: (bank, index) => values.get(`${bank}:${index}`) ?? 0,
      write: (bank, index, value) => {
        values.set(`${bank}:${index}`, value);
        return true;
      },
    },
  });
  assert.equal(state.execute(11, [100]), 7);
  assert.equal(state.execute(12, [100, 9]), 1);
  assert.equal(state.execute(11, [100]), 9);
  assert.equal(state.execute(13, [12]), 8);
  assert.equal(state.execute(14, [12, 10]), 1);
  assert.equal(state.execute(13, [12]), 10);
  assert.equal(state.execute(15, [197]), 9);
  assert.equal(state.execute(16, [197, 11]), 1);
  assert.equal(state.execute(15, [197]), 11);
  assert.equal(state.execute(21, []), 0x80);
  assert.equal(state.execute(0, []), 0);
  assert.equal(state.execute(21, []), 0);
  assert.equal(state.execute(2, []), 1);
});

test("free-conversation state binds the current persisted dialogue state", () => {
  const calls = [];
  const state = createNativeFreeConversationState();
  assert.equal(state.execute(11, [100]), undefined);
  assert.equal(state.configureDialogueState({
    read: (bank, index) => {
      calls.push(["read", bank, index]);
      return 7;
    },
    write: (bank, index, value) => {
      calls.push(["write", bank, index, value]);
      return true;
    },
  }), state);
  assert.equal(state.execute(11, [100]), 7);
  assert.equal(state.execute(12, [100, 8]), 1);
  assert.deepEqual(calls, [
    ["read", 2, 100],
    ["write", 2, 100, 8],
  ]);
  assert.throws(
    () => state.configureDialogueState({ read() {} }),
    /dialogue state is invalid/,
  );
});

test("unimplemented native scene adapters fail closed", async () => {
  const handlers = createNativeScriptedSceneSemanticHandlers();
  const result = await handlers["event-camera-request"](invocation([
    { kind: "constant", value: 2950 },
    { kind: "constant", value: 0 },
    { kind: "constant", value: 0 },
  ]));
  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "event-camera-adapter-missing");
});
