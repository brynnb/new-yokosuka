import assert from "node:assert/strict";
import test from "node:test";

import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  composeNativeRoomScene,
} from "../play/events/NativeRoomSceneComposition.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

test("composes exact room vectors, FIXO records, and attachment controls", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(composeNativeRoomScene(state, {
    objects: [{
      objectTag: "TBK1",
      nativePosition: [1.25, 2.5, -3.75],
      records: ["FIXO"],
    }],
    attachmentTargets: [{
      objectTag: "AKIR",
      hasMomtRecord: true,
      controlIds: [12, 18],
    }],
  }), {
    objectTags: ["TBK1"],
    attachmentTargetTags: ["AKIR"],
  });
  assert.deepEqual(state.readObjectVector("TBK1"), [
    nativeFloat32Word(1.25),
    nativeFloat32Word(2.5),
    nativeFloat32Word(-3.75),
  ]);
  assert.equal(state.readObjectFixoRecord("TBK1").word30, 0);
  assert.equal(state.installObjectFixoAttachment({
    objectTag: "TBK1",
    targetObjectTag: "AKIR",
    recordTag: "FIXO",
    controlId: 18,
    vector00And18Words: [1, 2, 3],
    vector0cAnd24Words: [4, 5, 6],
  }).controlMatched, true);
});

test("room composition rejects duplicate objects and unknown records", () => {
  const state = createNativeSceneGameplayState();
  assert.throws(() => composeNativeRoomScene(state, {
    objects: [
      { objectTag: "TBK1", nativePosition: [0, 0, 0] },
      { objectTag: "TBK1", nativePosition: [0, 0, 0] },
    ],
  }), /duplicated/);
  assert.throws(() => composeNativeRoomScene(state, {
    objects: [{
      objectTag: "TBK1",
      nativePosition: [0, 0, 0],
      records: ["GUES"],
    }],
  }), /not implemented/);
});
