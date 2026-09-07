import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNativeCurrentEventProfile,
  applyNativeDirectEntryState,
  applyNativeInteractionManagerProfile,
  applyNativeRoomScriptProfile,
  initializeNativeRoomTaggedObjectControllerPair,
} from "../play/events/NativeRoomScriptProfiles.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

test("applies only the captured D000 idle engine baseline", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(applyNativeRoomScriptProfile(state, "d000"), {
    area: "D000",
    applied: true,
    evidence: "tools/evidence/live-d000-script-engine-baseline-emulator-evidence.json",
    nativeFieldCount: 9,
  });
  assert.equal(state.readNativeField({ offset: 0x105, width: 1 }), 0);
  assert.equal(state.readNativeField({
    offset: 0x0c20c3d4,
    width: 4,
  }), 1);
  assert.equal(state.readNativeField({
    offset: 0x0c225251,
    width: 1,
  }), 1);
  assert.equal(state.readMomtNumericGlobalDword(), -1);
  assert.equal(state.readNativeField({
    offset: 0x0c29b134,
    width: 4,
  }), 0xffffffff);
});

test("leaves rooms without an extracted profile untouched", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(applyNativeRoomScriptProfile(state, "ABCD"), {
    area: "ABCD",
    applied: false,
    evidence: null,
  });
  assert.equal(state.readNativeField({ offset: 0x0c225251, width: 1 }), undefined);
  assert.equal(state.readMomtNumericGlobalDword(), undefined);
});

test("room initialization supplies the shared native event-runtime word", () => {
  const state = createNativeSceneGameplayState();
  state.initializeRoomRuntimeState();
  assert.equal(state.readNativeField({
    offset: 0x0c20c3d4,
    width: 4,
  }), 0);
});

test("interaction managers resolve by exact disc, area, and MAPINFO hash", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(applyNativeInteractionManagerProfile(state, {
    disc: 1,
    area: "D000",
    mapinfoSha256: "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e",
  }), {
    applied: true,
    managerId: "1:D000:7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e",
  });
  assert.equal(state.interactionManager.isConfigured(), true);
  assert.equal(state.queryInteractionManagerIndirectIndex(0, 1), 98);
  assert.equal(state.queryInteractionManagerIndirectIndex(0, 2), 99);

  assert.deepEqual(applyNativeInteractionManagerProfile(state, {
    disc: 1,
    area: "D000",
    mapinfoSha256: "not-the-source-hash",
  }), { applied: false, managerId: null });
  assert.equal(state.interactionManager.isConfigured(), false);
});

test("initializes only the exact extracted D000 controller pair", () => {
  assert.equal(initializeNativeRoomTaggedObjectControllerPair("D000", {
    firstObjectTag: "YKUL",
    secondObjectTag: "YKUR",
  }), 0);
  assert.equal(initializeNativeRoomTaggedObjectControllerPair("D000", {
    firstObjectTag: "YKUR",
    secondObjectTag: "YKUL",
  }), -1);
  assert.equal(initializeNativeRoomTaggedObjectControllerPair("ABCD", {
    firstObjectTag: "YKUL",
    secondObjectTag: "YKUR",
  }), -1);
});

test("binds the exact neutral controller event only to the phone route", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(applyNativeCurrentEventProfile(state, {
    program: { id: "disc1-d000-phone-book-0x6a49c" },
    route: { entryFunction: "0x6a49c" },
  }), {
    applied: true,
    evidence: "tools/evidence/live-d000-event-control-emulator-evidence.json",
    programId: "disc1-d000-phone-book-0x6a49c",
    entryFunction: "0x6a49c",
  });
  assert.deepEqual(state.readCurrentEventControlRecord(), {
    word04: 1,
    word08: 0,
    word0a: 0,
    byte0c: 0,
    byte0d: 0,
    byte0e: 0,
    byte0f: 0,
    word12: 0x8080,
  });

  state.clearCurrentEventControlRecord();
  assert.deepEqual(applyNativeCurrentEventProfile(state, {
    program: { id: "disc1-d000-entry-0x7abf4" },
    route: { entryFunction: "0x8002c" },
  }), { applied: false, evidence: null });
  assert.equal(state.readCurrentEventControlRecord(), undefined);
});

test("applies evidence-backed state only for its reviewed direct entry", () => {
  const state = createNativeSceneGameplayState();
  const program = {
    directEntryState: {
      "0x200": {
        sceneFields: [{ offset: 0x280, width: 4, value: 0xffffffff }],
        objectBaseVectors: [{ objectTag: "TEST", vector: [1, 2, 3] }],
        operation001cObjects: [{
          objectTag: "TEST",
          present: true,
          directWords: [4, 5, 6],
          associatedWords: [7, 8, 9],
        }],
        evidence: ["constructor.json#0x100"],
      },
    },
  };
  assert.deepEqual(applyNativeDirectEntryState(state, {
    program,
    route: { entryFunction: "0x200" },
  }), {
    applied: true,
    evidence: ["constructor.json#0x100"],
    fieldCount: 1,
    objectBaseVectorCount: 1,
    operation001cObjectCount: 1,
    entryFunction: "0x200",
  });
  assert.equal(
    state.readNativeField({ offset: 0x280, width: 4 }),
    0xffffffff,
  );
  assert.deepEqual(
    state.readObjectVector("TEST"),
    [0x3f800000, 0x40000000, 0x40400000],
  );
  assert.deepEqual(state.nativeOperation001cState.planNormal({
    objectTag: "TEST",
    destination: 0,
    associated: false,
  }).words, [4, 5, 6]);
  assert.deepEqual(applyNativeDirectEntryState(state, {
    program,
    route: { entryFunction: "0x300" },
  }), { applied: false, evidence: [] });
});
