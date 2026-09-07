import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorXmptState,
} from "../play/events/NativeActorXmptRuntime.js";

const HATO_REQUEST = {
  actorTag: "AKIR",
  target: [
    -121.16000366210938,
    -1.7999999523162842,
    77.94000244140625,
  ],
  requestWord: 42143,
  requestDword: 0x8000055e,
  stateSelector: 0,
};

test("selector zero preserves the recovered native XMPT lifecycle", () => {
  const xmpt = createNativeActorXmptState();
  const calls = [];
  let requestWord = 0;
  xmpt.request(HATO_REQUEST);

  // Request core dispatches the first controller update synchronously. Hato
  // queries 0x016e immediately after 0x0165, so state three must already be
  // visible here or the authored wait loop would be skipped.
  assert.equal(xmpt.stateZeroQuery("AKIR"), true);

  const controller = {
    startMotion(detail) {
      calls.push(["start", detail.phase, detail.request, detail.facing]);
      requestWord = detail.request;
      return true;
    },
    readMotionRequestWord(detail) {
      calls.push(["read", detail.phase, requestWord]);
      return requestWord;
    },
    commitTarget(detail) {
      calls.push([
        "commit",
        detail.phase,
        detail.target,
        detail.facingRaw,
      ]);
      return true;
    },
    convergeFacing(detail) {
      calls.push([
        "facing",
        detail.finalFacingRaw,
        detail.maximumStepRaw,
      ]);
      return true;
    },
    release(detail) {
      calls.push(["release", detail.actorTag]);
      return true;
    },
  };

  assert.equal(xmpt.updateActor("AKIR", controller).state, 4);
  assert.equal(xmpt.updateActor("AKIR", controller).updated, false);
  requestWord = 0;
  assert.equal(xmpt.updateActor("AKIR", controller).state, 5);
  assert.equal(xmpt.updateActor("AKIR", controller).state, 7);
  assert.equal(xmpt.updateActor("AKIR", controller).state, 8);
  assert.equal(xmpt.updateActor("AKIR", controller).updated, false);
  requestWord = 0;
  assert.equal(xmpt.updateActor("AKIR", controller).state, 11);
  assert.equal(xmpt.stateZeroQuery("AKIR"), true);
  assert.equal(xmpt.updateActor("AKIR", controller).state, 0);
  assert.equal(xmpt.stateZeroQuery("AKIR"), false);

  assert.deepEqual(calls, [
    [
      "start",
      "approach",
      0x055e,
      { kind: "target-bearing" },
    ],
    ["read", "approach", 0x055e],
    ["read", "approach", 0],
    ["commit", "approach", undefined, undefined],
    ["facing", 42143, 2730],
    [
      "start",
      "final-alignment",
      0x055e,
      { kind: "native-raw", value: 42143 },
    ],
    ["read", "final-alignment", 0x055e],
    ["read", "final-alignment", 0],
    [
      "commit",
      "final-alignment",
      HATO_REQUEST.target.map(Math.fround),
      42143,
    ],
    ["release", "AKIR"],
  ]);
});

test("unrecovered selectors remain installed and fail closed", () => {
  const xmpt = createNativeActorXmptState();
  xmpt.request({
    ...HATO_REQUEST,
    stateSelector: 4,
  });
  assert.equal(xmpt.read("AKIR").state, 1);
  assert.deepEqual(xmpt.updateActor("AKIR"), {
    updated: false,
    reason: "xmpt-selector-update-unimplemented",
    record: {
      target: HATO_REQUEST.target.map(Math.fround),
      requestWord: 42143,
      requestDword: 0x8000055e,
      motionRequest: 0x055e,
      selector: 4,
      state: 1,
      controllerRequestWord: 0,
      routeKind: null,
      revision: 1,
    },
  });
  assert.equal(xmpt.stateZeroQuery("AKIR"), false);
});

test("XMPT selector activity queries share the exact record owner", () => {
  const xmpt = createNativeActorXmptState();
  xmpt.request({ ...HATO_REQUEST, stateSelector: 5 });
  assert.equal(xmpt.selectorActiveQuery("AKIR", 5), true);
  assert.equal(xmpt.selectorActiveQuery("AKIR", 0), false);
  assert.equal(xmpt.selectorActiveQuery("MISS", 5), false);
});

test("selector five preserves near-route wait and alignment loop states", () => {
  const xmpt = createNativeActorXmptState();
  const calls = [];
  let requestWord = 0;
  let aligned = false;
  xmpt.request({ ...HATO_REQUEST, stateSelector: 5 });
  const preparedTarget = [-120.5, -1.8, 77.5].map(Math.fround);
  const controller = {
    prepareSelectorFiveRoute(detail) {
      calls.push(["prepare", detail.request]);
      return { kind: "near", target: preparedTarget };
    },
    startMotion(detail) {
      calls.push(["start", detail.phase, detail.routeKind ?? null]);
      requestWord = detail.request;
      return true;
    },
    readMotionRequestWord(detail) {
      calls.push(["read", detail.phase, requestWord]);
      return requestWord;
    },
    commitTarget(detail) {
      calls.push(["commit", detail.phase, detail.target]);
      return true;
    },
    releaseLookPoint(detail) {
      calls.push(["release-look", detail.actorTag]);
      return true;
    },
    selectorFiveAlignmentComplete(detail) {
      calls.push(["aligned", detail.requestWord, aligned]);
      return aligned;
    },
    release(detail) {
      calls.push(["release", detail.actorTag]);
      return true;
    },
  };

  assert.equal(xmpt.updateActor("AKIR", controller).state, 4);
  assert.equal(xmpt.read("AKIR").routeKind, "near");
  assert.equal(xmpt.updateActor("AKIR", controller).updated, false);
  requestWord = 0;
  assert.equal(xmpt.updateActor("AKIR", controller).state, 8);
  assert.equal(xmpt.updateActor("AKIR", controller).state, 7);
  assert.equal(xmpt.updateActor("AKIR", controller).state, 8);
  assert.equal(xmpt.updateActor("AKIR", controller).updated, false);
  requestWord = 0;
  aligned = true;
  assert.equal(xmpt.updateActor("AKIR", controller).state, 11);
  assert.equal(xmpt.selectorActiveQuery("AKIR", 5), true);
  assert.equal(xmpt.updateActor("AKIR", controller).state, 0);
  assert.equal(xmpt.selectorActiveQuery("AKIR", 5), false);

  assert.deepEqual(calls, [
    ["prepare", 0x055e],
    ["start", "selector-five-route", "near"],
    ["read", "selector-five-route", 0x055e],
    ["read", "selector-five-route", 0],
    ["commit", "selector-five-route", preparedTarget],
    ["release-look", "AKIR"],
    ["read", "selector-five-route", 0],
    ["aligned", 42143, false],
    ["start", "selector-five-final-alignment", null],
    ["read", "selector-five-final-alignment", 0x055e],
    ["read", "selector-five-final-alignment", 0],
    [
      "commit",
      "selector-five-final-alignment",
      HATO_REQUEST.target.map(Math.fround),
    ],
    ["aligned", 42143, true],
    ["release", "AKIR"],
  ]);
});

test("selector five fails closed without its native target preparation", () => {
  const xmpt = createNativeActorXmptState();
  xmpt.request({ ...HATO_REQUEST, stateSelector: 5 });
  assert.equal(
    xmpt.updateActor("AKIR").reason,
    "xmpt-selector-five-route-unprepared",
  );
  assert.equal(xmpt.read("AKIR").state, 3);
});
