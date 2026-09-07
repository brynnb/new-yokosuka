import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  DOBUITA_PHONE_BOOK_ATTACHMENTS,
  DOBUITA_PHONE_BOOK_RESOURCE,
  attachedSourceMatrix,
  attachmentLocalSourceMatrix,
  fixedTurnRadians,
  phoneBookNativeAttachmentState,
  phoneBookNativeSceneComposition,
  phoneBookPropState,
} from "../src/DobuitaPhoneBookInteraction.js";

test("retains the two source FIXO attachment records", () => {
  assert.deepEqual(DOBUITA_PHONE_BOOK_ATTACHMENTS.closed, {
    objectTag: "TBK1",
    parentTag: "AKIR",
    modelControlId: 18,
    runtimeMatrixIndex: 36,
    renderKey: -0x41,
    translation: [0.09839999675750732, 0, -0.10700000077486038],
    rotationRaw: [0x3d27, 0xcccc, 0x76c1],
  });
  assert.deepEqual(DOBUITA_PHONE_BOOK_ATTACHMENTS.opened, {
    objectTag: "TBK3",
    parentTag: "AKIR",
    modelControlId: 12,
    runtimeMatrixIndex: 30,
    renderKey: -0x42,
    translation: [
      0.20329999923706055,
      0.014000000432133675,
      0.052000001072883606,
    ],
    rotationRaw: [0xb8e4, 0x9552, 0x58dc],
  });
  assert.equal(fixedTurnRadians(0x4000), Math.PI / 2);
});

test("bundles the exact opened telephone-book model", () => {
  const bytes = fs.readFileSync("play/assets/dobuita/DENS502G.CHRM");
  assert.equal(bytes.length, 2196);
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    "bc68d76e1f0a53f2bb9a5c63eabf4dfa7b9bb15e3c5096c40673074a9ee67bde",
  );
});

test("composes FIXO local transform before its parent control matrix", () => {
  const attachment = DOBUITA_PHONE_BOOK_ATTACHMENTS.closed;
  const local = attachmentLocalSourceMatrix(attachment);
  const parent = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    4, 5, 6, 1,
  ];
  const attached = attachedSourceMatrix(parent, attachment);

  assert.deepEqual(attached.slice(0, 12), local.slice(0, 12));
  assert.ok(Math.abs(attached[12] - (local[12] + 4)) < 1e-12);
  assert.ok(Math.abs(attached[13] - (local[13] + 5)) < 1e-12);
  assert.ok(Math.abs(attached[14] - (local[14] + 6)) < 1e-12);
});

test("selects only script-backed prop states for authored phases", () => {
  assert.equal(phoneBookPropState("dobuitaPhoneBook:blendIn"), null);
  assert.equal(phoneBookPropState("dobuitaPhoneBook:entry"), "closed");
  assert.equal(phoneBookPropState("dobuitaPhoneBook:loop"), "opened");
  assert.equal(phoneBookPropState("dobuitaPhoneBook:exit"), null);
  assert.equal(phoneBookPropState("idle"), null);
});

test("packages exact phone objects and DESA as native room composition", () => {
  assert.deepEqual(DOBUITA_PHONE_BOOK_RESOURCE, {
    path: "/scene/01/D000/",
    name: "DESA",
  });
  assert.deepEqual(phoneBookNativeSceneComposition({
    closedPosition: [1, 2, 3],
    openedPosition: [0, 0, 0],
    resourceReady: true,
  }), {
    objects: [
      {
        objectTag: "TBK1",
        nativePosition: [1, 2, 3],
        records: ["FIXO"],
      },
      {
        objectTag: "TBK3",
        nativePosition: [0, 0, 0],
        records: ["FIXO"],
      },
    ],
    attachmentTargets: [{
      objectTag: "AKIR",
      hasMomtRecord: true,
      controlIds: [18, 12],
    }],
    resources: [{
      path: "/scene/01/D000/",
      name: "DESA",
      ready: true,
    }],
  });
});

test("selects native phone props only from an exact active FIXO record", () => {
  const records = new Map([
    ["TBK1", {
      word30: 1,
      targetObjectTag: "AKIR",
      controlIdDword: 18,
    }],
  ]);
  assert.equal(
    phoneBookNativeAttachmentState(tag => records.get(tag)),
    "closed",
  );
  records.set("TBK1", { ...records.get("TBK1"), word30: 0 });
  records.set("TBK3", {
    word30: 1,
    targetObjectTag: "AKIR",
    controlIdDword: 12,
  });
  assert.equal(
    phoneBookNativeAttachmentState(tag => records.get(tag)),
    "opened",
  );
  records.set("TBK3", { ...records.get("TBK3"), controlIdDword: 11 });
  assert.equal(
    phoneBookNativeAttachmentState(tag => records.get(tag)),
    null,
  );
});
