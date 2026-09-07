import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorLookPointSceneControl,
  createNativeAseqActorLookPointPresentation,
} from "../play/events/NativeAseqActorLookPointPresentation.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";

test("AUTH actor look-point presentation resolves native actor components", () => {
  const calls = [];
  const runtime = createNativeAseqActorLookPointPresentation({
    actors: {
      componentWorldPosition(actorTag, selector) {
        assert.deepEqual([actorTag, selector], ["ASDA", 5]);
        return [3, 4, 5];
      },
    },
    controlActorLookPoint: detail => (calls.push(detail), true),
  });
  const owner = Object.freeze({ id: "TOKI" });
  assert.equal(runtime.begin(owner), true);
  assert.equal(runtime.play(owner, {
    name: "actor-look-point",
    actorTag: "AKIR",
    selector: 98312,
    mode: 0,
    target: {
      kind: "actor-component",
      actorTag: "ASDA",
      selector: 5,
      offset: [0.25, 0.5, -0.75],
    },
    callFileOffset: "0x1506",
  }), true);
  assert.deepEqual(calls[0], {
    actorCode: "AKIR",
    selector: 98312,
    target: [-2.75, 4.5, 4.25],
    mode: 0,
    source: { kind: "native-aseq-callback", callFileOffset: "0x1506" },
  });
  assert.equal(runtime.play(owner, {
    name: "actor-look-point",
    actorTag: "AKIR",
    selector: -98312,
    mode: 0,
    target: null,
    callFileOffset: "0xbee",
  }), true);
  assert.equal(calls[1].target, null);
  assert.equal(runtime.end(owner), true);
  assert.equal(runtime.reset(), true);
});

test("AUTH actor look-point scene adapter applies native float words", () => {
  const calls = [];
  const control = createNativeActorLookPointSceneControl({
    getSceneState: () => ({
      applyActorLookPointControl(detail) {
        calls.push(detail);
        return { applied: true };
      },
    }),
  });
  assert.equal(control({
    actorCode: "AKIR",
    selector: 98312,
    target: [-2.75, 4.5, 4.25],
    mode: 0,
  }), true);
  assert.deepEqual(calls, [{
    actorTag: "AKIR",
    selector: 98312,
    targetVector: [-2.75, 4.5, 4.25].map(nativeFloat32Word),
    mode: 0,
  }]);
});
