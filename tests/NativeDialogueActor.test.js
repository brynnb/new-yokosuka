import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_DIALOGUE_ACTOR_RESOURCE_COUNT,
  NATIVE_DIALOGUE_DYNAMIC_ACTOR_PROGRESS_BINDING_COUNT,
  NATIVE_DIALOGUE_FIXED_ACTOR_PROGRESS_BINDING_COUNT,
  nativeDialogueActorDescriptor,
  resolveNativeDialogueActorProgressIndex,
} from "../play/dialogue/NativeDialogueActor.js";
import {
  createNativeDialogueProgressIndexAllocator,
} from "../play/dialogue/NativeDialogueProgressIndex.js";

test("native actor descriptors retain authored progress identities", () => {
  assert.equal(NATIVE_DIALOGUE_ACTOR_RESOURCE_COUNT, 257);
  assert.equal(NATIVE_DIALOGUE_FIXED_ACTOR_PROGRESS_BINDING_COUNT, 240);
  assert.equal(NATIVE_DIALOGUE_DYNAMIC_ACTOR_PROGRESS_BINDING_COUNT, 17);
  assert.equal(
    nativeDialogueActorDescriptor("jono").authoredPersonIdentity,
    "YOPA",
  );
  assert.equal(
    nativeDialogueActorDescriptor("MTRI").fixedProgressIndex,
    nativeDialogueActorDescriptor("YOPA").fixedProgressIndex,
  );
});

test("native actor descriptors retain exact participant facing targets", () => {
  const aksk = nativeDialogueActorDescriptor("AKSK");
  assert.deepEqual(aksk.participantFacingTargets, [
    [6, 1.5, 86],
    [-57, 1.5, 83],
    [-19.200000762939453, 1.5, 76.4000015258789],
  ]);
  assert.deepEqual(
    nativeDialogueActorDescriptor("AKMI").participantFacingTargets,
    [],
  );
});

test("actor descriptors resolve fixed and dynamic progress records", () => {
  const allocator = createNativeDialogueProgressIndexAllocator();
  assert.equal(
    resolveNativeDialogueActorProgressIndex("HATO", allocator),
    30,
  );
  assert.equal(
    resolveNativeDialogueActorProgressIndex("YUJI", allocator),
    301,
  );
  assert.equal(
    resolveNativeDialogueActorProgressIndex("YUJI", allocator),
    301,
  );
  assert.equal(resolveNativeDialogueActorProgressIndex("NONE", allocator), null);
  assert.throws(
    () => resolveNativeDialogueActorProgressIndex("YUJI"),
    /dynamic progress pool/,
  );
});
