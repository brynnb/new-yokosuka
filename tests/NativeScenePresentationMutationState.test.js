import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

test("scene gameplay state publishes ordered presentation mutations", () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector("AKIR", [0x3f800000, 0x40000000, 0x40400000]);
  state.writeObjectRuntimeFlag("AKIR", false);
  state.writeObjectPresentationFlag("AKIR", true);
  state.applyObjectVectorOperation({
    objectTag: "AKIR",
    flags: 0x38000000,
    vector: [0, 0x00004000, 0],
  });
  state.writeObjectScaleVector("AKIR", [0x3f800000, 0x3f800000, 0x3f800000]);

  const batch = state.readPresentationMutations(0);
  assert.equal(batch.revision, 5);
  assert.deepEqual(batch.mutations.map(mutation => ({
    revision: mutation.revision,
    kind: mutation.kind,
    objectTag: mutation.objectTag,
  })), [
    { revision: 1, kind: "object-position-vector", objectTag: "AKIR" },
    { revision: 2, kind: "object-runtime-flag", objectTag: "AKIR" },
    { revision: 3, kind: "object-presentation-flag", objectTag: "AKIR" },
    { revision: 4, kind: "object-secondary-vector", objectTag: "AKIR" },
    { revision: 5, kind: "object-scale-vector", objectTag: "AKIR" },
  ]);
  assert.deepEqual(
    state.readPresentationMutations(2).mutations.map(value => value.revision),
    [3, 4, 5],
  );
  assert.throws(
    () => state.readPresentationMutations(6),
    /outside the retained range/,
  );
});

test("presentation revisions participate in room-state rollback", () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector("AKIR", [0, 0, 0]);
  const snapshot = state.snapshot();
  state.writeObjectRuntimeFlag("AKIR", true);
  assert.equal(state.presentationRevision(), 2);

  state.restore(snapshot);
  assert.equal(state.presentationRevision(), 1);
  assert.deepEqual(state.readPresentationMutations(1).mutations, []);
  state.writeObjectPresentationFlag("AKIR", false);
  assert.equal(state.presentationRevision(), 2);
  assert.equal(
    state.readPresentationMutations(1).mutations[0].kind,
    "object-presentation-flag",
  );
});

test("presentation mutations preserve byte-oriented object identity", () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectRuntimeFlag("dor0", true);
  const mutation = state.readPresentationMutations(0).mutations[0];
  assert.equal(mutation.objectTag, "dor0");
  assert.equal(Object.isFrozen(mutation), true);

  const snapshot = state.snapshot();
  state.restore(snapshot);
  const restored = state.readPresentationMutations(0).mutations[0];
  assert.equal(restored.objectTag, "dor0");
  assert.equal(Object.isFrozen(restored), true);
});
