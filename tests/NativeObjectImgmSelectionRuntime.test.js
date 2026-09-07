import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeObjectImgmSelectionSemanticHandlers,
  createNativeObjectImgmSelectionState,
} from "../play/events/NativeObjectImgmSelectionRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";
import {
  NativeCompositeProgramPresentation,
} from "../play/events/NativeCompositeProgramPresentation.js";

function action(value, objectTag = "FIR1") {
  return {
    semanticId: "resolved-object-imgm-selection-write",
    callFileOffset: "0x818",
    arguments: [
      { kind: "constant", value: 0x31524946, ascii: objectTag },
      { kind: "runtime" },
    ],
  };
}

async function execute(value, options = {}, context = {}) {
  const handler = createNativeObjectImgmSelectionSemanticHandlers(options)[
    "resolved-object-imgm-selection-write"
  ];
  return handler({
    action: action(value),
    context: {
      location: { functionId: "0x6dc" },
      ...context,
    },
    readArgument: index => index === 0 ? 0x31524946 : value,
  });
}

test("operation 0x008c writes the low byte to generic IMGM state", async () => {
  const state = createNativeObjectImgmSelectionState();
  const result = await execute(0x123456fe, {}, {
    nativeObjectImgmSelectionState: state,
  });

  assert.equal(state.read("FIR1"), 0xfe);
  assert.deepEqual(result, {
    status: "continued",
    mutation: {
      kind: "object-imgm-selection",
      objectTag: "FIR1",
      selection: 0xfe,
      applied: true,
      source: {
        functionFileOffset: "0x6dc",
        callFileOffset: "0x818",
      },
    },
  });
});

test("operation 0x008c preserves the native null-object no-op", async () => {
  const writes = [];
  const result = await execute(-1, {
    hasSceneObject: async objectTag => objectTag !== "FIR1",
    writeObjectImgmSelection: (...detail) => writes.push(detail),
  });

  assert.deepEqual(writes, []);
  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    kind: "object-imgm-selection",
    objectTag: "FIR1",
    selection: 0xff,
    applied: false,
    source: {
      functionFileOffset: "0x6dc",
      callFileOffset: "0x818",
    },
  });
});

test("operation 0x008c requires proven object and writer results", async () => {
  assert.equal(
    (await execute(4, { hasSceneObject: () => null })).reason,
    "object-imgm-selection-object-result-invalid",
  );
  assert.equal(
    (await execute(4)).reason,
    "object-imgm-selection-writer-missing",
  );
  assert.equal(
    (await execute(4, {
      writeObjectImgmSelection: () => false,
    })).reason,
    "object-imgm-selection-write-rejected",
  );
});

test("IMGM selection state snapshots and restores exact byte values", () => {
  const state = createNativeObjectImgmSelectionState();
  state.write("BIR2", 7);
  const snapshot = state.snapshot();
  assert.deepEqual(state.write("BIR2", 9), {
    objectTag: "BIR2",
    previous: 7,
    selection: 9,
    changed: true,
  });
  state.restore(snapshot);
  assert.equal(state.read("BIR2"), 7);
  assert.throws(() => state.write("TOO-LONG", 1), /four-byte object tag/);
  assert.throws(() => state.write("FIR1", 1.5), /32-bit word/);
});

test("scene state owns IMGM selection and publishes a typed mutation", () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  context.writeObjectImgmSelection("FIR3", 0x103);

  assert.equal(scene.readObjectImgmSelection("FIR3"), 3);
  assert.equal(context.readObjectImgmSelection("FIR3"), 3);
  assert.equal(
    context.nativeObjectImgmSelectionState,
    scene.nativeObjectImgmSelectionState,
  );
  assert.deepEqual(scene.readPresentationMutations(0).mutations[0], {
    revision: 1,
    kind: "object-imgm-selection",
    objectTag: "FIR3",
    selection: 3,
  });
});

function root() {
  const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) {
    Object.assign(this, { x, y, z });
  } });
  return {
    position: vector(),
    rotation: vector(),
    scaling: { ...vector(), x: 1, y: 1, z: 1 },
    rotationQuaternion: null,
    getDescendants: () => [],
    isEnabled: () => true,
    setEnabled() {},
    computeWorldMatrix() {},
  };
}

test("rooted IMGM presentation fails closed without an exact actor adapter", () => {
  const sceneState = createNativeSceneGameplayState();
  sceneState.writeObjectImgmSelection("FIR1", 2);
  const presentation = new NativeCompositeProgramPresentation({
    sceneState,
    resolveProgramActor: () => ({ root: root() }),
  });
  assert.throws(
    () => presentation.begin("owner", ["FIR1"]),
    /no exact IMGM selection adapter/,
  );
});

test("rooted IMGM presentation delegates only to its exact actor adapter", () => {
  const sceneState = createNativeSceneGameplayState();
  sceneState.writeObjectImgmSelection("FIR4", 5);
  const selections = [];
  const actor = {
    root: root(),
    applyNativeImgmSelection(selection) {
      selections.push(selection);
      return true;
    },
  };
  const presentation = new NativeCompositeProgramPresentation({
    sceneState,
    resolveProgramActor: () => actor,
  });
  assert.equal(presentation.begin("owner", ["FIR4"]), true);
  assert.deepEqual(selections, [5]);
  presentation.end("owner");
});
