import { Mt5Loader } from "./Mt5Loader.js";

// Recovered from the two MAPINFO operation 0x00e6 calls in the TBK routine.
// FIXO stores translation first, then 16-bit-turn Euler rotation, and resolves
// the numbered AKIR control on every update.
export const DOBUITA_PHONE_BOOK_ATTACHMENTS = Object.freeze({
  closed: Object.freeze({
    objectTag: "TBK1",
    parentTag: "AKIR",
    modelControlId: 18,
    runtimeMatrixIndex: 36,
    renderKey: -0x41,
    translation: Object.freeze([
      0.09839999675750732,
      0,
      -0.10700000077486038,
    ]),
    rotationRaw: Object.freeze([0x3d27, 0xcccc, 0x76c1]),
  }),
  opened: Object.freeze({
    objectTag: "TBK3",
    parentTag: "AKIR",
    modelControlId: 12,
    runtimeMatrixIndex: 30,
    renderKey: -0x42,
    translation: Object.freeze([
      0.20329999923706055,
      0.014000000432133675,
      0.052000001072883606,
    ]),
    rotationRaw: Object.freeze([0xb8e4, 0x9552, 0x58dc]),
  }),
});

export const DOBUITA_PHONE_BOOK_RESOURCE = Object.freeze({
  path: "/scene/01/D000/",
  name: "DESA",
});

function exactPosition(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(component => !Number.isFinite(component))
  ) {
    throw new TypeError(`${label} must contain three finite numbers`);
  }
  return value.map(component => Math.fround(component));
}

export function phoneBookNativeSceneComposition({
  closedPosition,
  openedPosition,
  resourceReady,
}) {
  if (typeof resourceReady !== "boolean") {
    throw new TypeError("telephone-book resource readiness must be Boolean");
  }
  const attachments = Object.values(DOBUITA_PHONE_BOOK_ATTACHMENTS);
  const parentTags = [...new Set(attachments.map(item => item.parentTag))];
  if (parentTags.length !== 1) {
    throw new Error("telephone-book attachments require one exact parent");
  }
  return {
    objects: [
      {
        objectTag: DOBUITA_PHONE_BOOK_ATTACHMENTS.closed.objectTag,
        nativePosition: exactPosition(closedPosition, "closed book position"),
        records: ["FIXO"],
      },
      {
        objectTag: DOBUITA_PHONE_BOOK_ATTACHMENTS.opened.objectTag,
        nativePosition: exactPosition(openedPosition, "opened book position"),
        records: ["FIXO"],
      },
    ],
    attachmentTargets: [{
      objectTag: parentTags[0],
      hasMomtRecord: true,
      controlIds: attachments.map(item => item.modelControlId),
    }],
    resources: [{
      ...DOBUITA_PHONE_BOOK_RESOURCE,
      ready: resourceReady,
    }],
  };
}

export function fixedTurnRadians(raw) {
  return (raw / 0x10000) * Math.PI * 2;
}

export function attachmentLocalSourceMatrix(attachment) {
  return Mt5Loader.sourceTransformMatrix({
    scl: { x: 1, y: 1, z: 1 },
    rot: {
      x: fixedTurnRadians(attachment.rotationRaw[0]),
      y: fixedTurnRadians(attachment.rotationRaw[1]),
      z: fixedTurnRadians(attachment.rotationRaw[2]),
    },
    pos: {
      x: attachment.translation[0],
      y: attachment.translation[1],
      z: attachment.translation[2],
    },
  });
}

export function attachedSourceMatrix(parentControlMatrix, attachment) {
  return Mt5Loader.rowMultiply(
    attachmentLocalSourceMatrix(attachment),
    parentControlMatrix,
  );
}

// The native routine keeps TBK1 fixed to control 18 while TORU runs, swaps to
// TBK3 on control 12 for LOOK, and detaches the prop before OKU. Browser blend
// clips do not correspond to native object operations and intentionally retain
// the adjacent authored phase's state.
export function phoneBookPropState(animationState) {
  if (animationState === "dobuitaPhoneBook:entry") return "closed";
  if (animationState === "dobuitaPhoneBook:loop") return "opened";
  return null;
}

export function phoneBookNativeAttachmentState(readFixoRecord) {
  if (typeof readFixoRecord !== "function") return null;
  for (const [state, attachment] of Object.entries(
    DOBUITA_PHONE_BOOK_ATTACHMENTS,
  )) {
    const record = readFixoRecord(attachment.objectTag);
    if (
      record?.word30 === 1
      && record.targetObjectTag === attachment.parentTag
      && record.controlIdDword === attachment.modelControlId
    ) {
      return state;
    }
  }
  return null;
}
