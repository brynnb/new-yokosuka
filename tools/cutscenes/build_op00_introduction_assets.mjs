#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAuthCamera } from "../../src/AuthCamera.js";
import { evaluateAuthActor, parseAuthMovement } from "../../src/AuthMovement.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../../src/AuthSequence.js";
import { parseAuthStrings } from "../../src/AuthStrings.js";
import { parseAuthTrack } from "../../src/AuthTrack.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  parseChrtSceneObjectBindings,
} from "../lib/chrt_scene_object_bindings.js";
import {
  deriveNativeAseqCallOwnership,
  nativeAseqGoverningActivityFrame as governingActivityFrame,
} from "../lib/NativeAseqScriptOwnership.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const sourceDirectory = path.join(sourceRoot, "data/SCENE/01/OP00");
const faceSourceDirectory = path.join(sourceRoot, "data/SCENE/01/MODEL/FACE");
const handSourceDirectory = path.join(sourceRoot, "data/SCENE/01/MODEL/HAND");
const outputDirectory = path.join(repoRoot, "play/assets/introduction/op00");
const modelOutputDirectory = path.join(outputDirectory, "models");
const faceOutputDirectory = path.join(outputDirectory, "faces");
const handOutputDirectory = path.join(outputDirectory, "hands");
const nativeTalkPosePath = path.join(
  repoRoot,
  "play/assets/cutscenes/native-faces",
  "native-talk-poses.generated.json",
);
const inventoryPath = path.join(outputDirectory, "asset-inventory.generated.json");
const activityManifestPath = path.join(outputDirectory, "manifest.json");

const SOURCE_EXPECTATIONS = Object.freeze({
  "MAPINFO.BIN": Object.freeze({
    byteLength: 342204,
    sha256: "8c2e8957ba3c96eb0a1315249db1abe1cb5931ea1bd63ee9601f30d1c8f257e4",
  }),
  "OP99.AFS": Object.freeze({
    byteLength: 7426048,
    sha256: "738cb6917d7bc08cc5bbd12e5ded5157ff9c5ffadcce199c5c0f89b25b9c557f",
  }),
  "M_0101A.BIN": Object.freeze({
    byteLength: 1088092,
    sha256: "9f8c51cf72a454991091557844b15856c34b3444907d8e438bf221f62eef5358",
  }),
});
const FACE_SOURCE_EXPECTATIONS = Object.freeze({
  "YKC_F.MT5": Object.freeze({
    byteLength: 150664,
    sha256: "839c307a88fadb82877a7a68c3545b7ea90c6a2b4af3b6a48b6b62eec39af0b6",
  }),
  "YKC_FTBL.BIN": Object.freeze({
    byteLength: 5916,
    sha256: "1b0f9d6317bcda987476eb99043e203575eed68920c93a0adf91482d918abd67",
  }),
  "FUK_F.MT5": Object.freeze({
    byteLength: 142760,
    sha256: "91d7ea39451d3f45c6c7b4a8536d3f0a349be274df9581df64f5177c17dcf1ed",
  }),
  "FUK_FTBL.BIN": Object.freeze({
    byteLength: 5004,
    sha256: "0da346204075039870a014ed304b2c77af9a410f3a07e2a1f8f4196743725047",
  }),
  "INE_F.MT5": Object.freeze({
    byteLength: 111908,
    sha256: "0e4b50d8926ba3d2c53ba82955c825c6a806ae12725482d659592fe6e1d418a1",
  }),
  "INE_FTBL.BIN": Object.freeze({
    byteLength: 4980,
    sha256: "5116ef74d03b22381cb4e440de3493b54629fe3afce619dc87fa7689a6aedd7e",
  }),
  "IWA_F.MT5": Object.freeze({
    byteLength: 111728,
    sha256: "3843ab19cc4b70ee3ce0b1eadc3b1847c5d9c7cf9229ff474484d91f1288f29f",
  }),
  "IWA_FTBL.BIN": Object.freeze({
    byteLength: 4544,
    sha256: "406ceb8399fba2ef989af0871b47c42ad62e2a1aadf536eba39f2af4c78501c3",
  }),
  "KOK_F.MT5": Object.freeze({
    byteLength: 282556,
    sha256: "4003de7ecee8966570f760196205e8201ad186e838f54d36dda31f788dd6c63b",
  }),
  "KOK_FTBL.BIN": Object.freeze({
    byteLength: 7824,
    sha256: "8df5fc417b0a934bfac4809eeb81d5dfe2377c681560f881d3826040d2345124",
  }),
});
const REQUIRED_FACIAL_ASSETS = Object.freeze({
  AKIR: Object.freeze({ faceCode: "YKC", bodyModelCode: "YKC_M" }),
  FUKU: Object.freeze({ faceCode: "FUK", bodyModelCode: "FUK_M" }),
  INE_: Object.freeze({ faceCode: "INE", bodyModelCode: "INE_M" }),
  IWAO: Object.freeze({ faceCode: "IWA", bodyModelCode: "IWA_M" }),
  SORY: Object.freeze({ faceCode: "KOK", bodyModelCode: "KOK_M" }),
});
const HAND_SOURCE_EXPECTATIONS = Object.freeze({
  "YKB_HM.BIN": Object.freeze({
    byteLength: 9264,
    sha256: "bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729",
  }),
  "YKB_TL.MT5": Object.freeze({
    byteLength: 40704,
    sha256: "517a3423b4cb2c7f96f9cb71475e3f34bc6891af1a0fe892b85c8810826936ec",
  }),
  "YKB_TR.MT5": Object.freeze({
    byteLength: 40760,
    sha256: "1564720156a4967703256cf4e1070e69c660cd57296bdf3b8ea13bffc46dccb8",
  }),
  "FUK_HM.BIN": Object.freeze({
    byteLength: 9264,
    sha256: "4a6c85858467733b459eb40588ff3116fa31c1c4a364b442f0c1169e2cf2bf34",
  }),
  "FUK_TL.MT5": Object.freeze({
    byteLength: 162476,
    sha256: "3434d9f1d5ce9c9e7690a112de21e91085f998ab2b0f880121ff2b114e244ceb",
  }),
  "FUK_TR.MT5": Object.freeze({
    byteLength: 162556,
    sha256: "fed2ba987a8a7095246d3da7eb8acf2f6814a9db9e906bf6a33c4daeb8ea2fec",
  }),
  "INE_HM.BIN": Object.freeze({
    byteLength: 9264,
    sha256: "c386a4f223da87a797bfafb9990507fb02cc72e122d47ccaa6fc43d417a72ff5",
  }),
  "INE_TL.MT5": Object.freeze({
    byteLength: 47812,
    sha256: "25e9cd4b53d933f76887fb0a9e1cfe168a54e4032d5856e8b96e7d54dabe117e",
  }),
  "INE_TR.MT5": Object.freeze({
    byteLength: 47868,
    sha256: "4ce6cec8fd94d7ce04bc8fe3cedffc7eb28475bcd27bf25ef7a05e9ff8ede101",
  }),
  "IWA_HM.BIN": Object.freeze({
    byteLength: 9264,
    sha256: "e9ac04b80a5b7f693d6af299683073906c5a2bd0d47d88676a6707501bfb0e06",
  }),
  "IWA_TL.MT5": Object.freeze({
    byteLength: 185148,
    sha256: "f19af6e7483e12e39a7db653661e2cc15b63a27bda5005929d4581251603b80b",
  }),
  "IWA_TR.MT5": Object.freeze({
    byteLength: 185204,
    sha256: "bd606f4acca38d5a1ab9ccd538f95b93c0211d1fce2302f4e8a128c2da94590d",
  }),
  "KOK_HM.BIN": Object.freeze({
    byteLength: 9264,
    sha256: "bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729",
  }),
  "KOK_TL.MT5": Object.freeze({
    byteLength: 291584,
    sha256: "1ee831452a8da8ff7b9ee433c7e92bef2fb08ef9b36ebaa925abb2f58ca11a2c",
  }),
  "KOK_TR.MT5": Object.freeze({
    byteLength: 275196,
    sha256: "db5ab9b73a2cf225e55a97fd6b1e9e47198c562ed01998008d55c1e4355068ee",
  }),
});
const REQUIRED_HAND_ASSETS = Object.freeze({
  // Save-state slot 5 (index 4) proves that the A0114 close-up instantiates
  // YKB_TL/YKB_TR for Ryo. OP99's YKD package belongs to the wider OP00 room
  // inventory and is not an opening-hand selection rule.
  AKIR: Object.freeze({
    handCode: "YKB",
    bodyModelCode: "YKC_M",
    leftRootRenderKey: 10,
    rightRootRenderKey: 5,
  }),
  FUKU: Object.freeze({
    handCode: "FUK",
    bodyModelCode: "FUK_M",
    leftRootRenderKey: 11,
    rightRootRenderKey: 6,
  }),
  INE_: Object.freeze({
    handCode: "INE",
    bodyModelCode: "INE_M",
    leftRootRenderKey: 11,
    rightRootRenderKey: 6,
  }),
  IWAO: Object.freeze({
    handCode: "IWA",
    bodyModelCode: "IWA_M",
    leftRootRenderKey: 11,
    rightRootRenderKey: 6,
  }),
  SORY: Object.freeze({
    handCode: "KOK",
    bodyModelCode: "KOK_M",
    leftRootRenderKey: 12,
    rightRootRenderKey: 7,
  }),
});

// Native operation 0x005e drives the separate high-detail HAND controller.
// These are its exact call sites inside the 24 A0114 activity functions. The
// builder decodes and validates every argument and governing frame comparison
// below; only the call-site-to-track ownership is recorded here because the
// room script has no higher-level table for that relationship.
const OPENING_HAND_POSE_CALLS = Object.freeze([
  [1, 0x17f2], [1, 0x1812], [1, 0x1cf6], [1, 0x1d16],
  [3, 0x272e], [3, 0x274e], [3, 0x2a9e], [3, 0x2abe],
  [3, 0x2b5e], [3, 0x2b7e], [4, 0x742e],
  [18, 0x792e], [18, 0x794e], [18, 0x7d56], [18, 0x7fbe],
  [18, 0x80e2], [18, 0x8136], [18, 0x8186], [18, 0x81d6],
  [18, 0x8226], [18, 0x865e], [18, 0x867e],
  [19, 0x8b3e], [19, 0x8b5e], [19, 0x8db2], [19, 0x8dd2],
  [5, 0x900e], [5, 0x90de], [5, 0x90fe],
  [6, 0x95b2], [6, 0x960a], [6, 0x96be],
  [7, 0x9a66], [7, 0x9a86],
  [8, 0x9fc2], [8, 0xa142], [8, 0xa1c6],
  [9, 0xa660], [10, 0xad4a],
  [20, 0xb50e], [20, 0xb52e],
  [23, 0xb9b8], [23, 0xb9d8], [23, 0xba30], [23, 0xba50],
  [23, 0xbc72], [23, 0xbc92], [23, 0xbfb2],
  [14, 0xc2e2], [14, 0xc302], [17, 0xc82e],
  [21, 0xccea], [21, 0xcd0a], [21, 0xcdb2], [21, 0xcdfe],
  [21, 0xce4a], [21, 0xcf26], [21, 0xcf72], [21, 0xd00e],
  [21, 0xd11e], [21, 0xd1ba], [21, 0xd2a2], [21, 0xd382],
  [21, 0xd3a2], [21, 0xd432],
].map(([trackIndex, callFileOffset]) => Object.freeze({
  trackIndex,
  callFileOffset,
})));

// Track 8 invokes one of these two sites on every frame 123..179. The choice
// is the exact `(frame & 2)` branch in MAPINFO, used to keep Soryu's left hand
// moving toward alternating native targets.
const OPENING_HAND_POSE_RANGED_CALLS = Object.freeze([
  Object.freeze({
    trackIndex: 8,
    callFileOffset: 0xa47a,
    firstFrame: 123,
    lastFrame: 179,
    frameMask: 2,
    maskedValue: 2,
  }),
  Object.freeze({
    trackIndex: 8,
    callFileOffset: 0xa4d2,
    firstFrame: 123,
    lastFrame: 179,
    frameMask: 2,
    maskedValue: 0,
  }),
]);

// Native operation 0x0113 selects both a six-tick TALK clip base and the
// current selector inside that clip. The browser previously kept every face
// at clip zero, which preserved speech-mouth cues but discarded the opening's
// authored brow, eyelid, and expression changes. As with HAND above, MAPINFO
// has no separate timeline table: retain the exact call-site ownership here
// and decode every argument and governing AUTH frame from the pinned script.
const OPENING_FACE_CLIP_CALLS = Object.freeze([
  [0, 0x0d52], [0, 0x0f1a], [0, 0x0f66],
  [1, 0x157e], [1, 0x159a], [1, 0x16fa], [1, 0x176a],
  [1, 0x18a6], [1, 0x193e], [1, 0x1a46], [1, 0x1a92],
  [1, 0x1ade], [1, 0x1b2a], [1, 0x1b76], [1, 0x1b92],
  [1, 0x1c22], [1, 0x1c6e], [1, 0x1daa], [1, 0x1e42],
  [2, 0x23ba],
  [3, 0x266a], [3, 0x2686], [3, 0x28e6], [3, 0x2a16],
  [3, 0x2b0e], [3, 0x2c66], [3, 0x2cb2], [3, 0x2cfe],
  [3, 0x2d4a], [3, 0x2d96], [3, 0x2de2], [3, 0x2e2e],
  [3, 0x2e7a], [3, 0x2ec6], [3, 0x2f12], [3, 0x301e],
  [4, 0x73d6], [4, 0x73f2], [4, 0x750e], [4, 0x755a],
  [4, 0x75a6], [4, 0x75f2],
  [18, 0x7c56], [18, 0x7da6], [18, 0x7e3e], [18, 0x7e8a],
  [18, 0x7ed6], [18, 0x7f22], [18, 0x7f6e], [18, 0x7fda],
  [18, 0x802a], [18, 0x8076], [18, 0x80c2], [18, 0x8272],
  [18, 0x840e], [18, 0x84fe], [18, 0x854a], [18, 0x86d2],
  [19, 0x8ae6], [19, 0x8bba], [19, 0x8e6e],
  [5, 0x8fd2], [5, 0x8fee], [5, 0x9396], [5, 0x93e2],
  [6, 0x95ce],
  [7, 0x9c1a],
  [8, 0xa0d6], [8, 0xa0f2], [8, 0xa18a],
  [9, 0xa74a], [9, 0xa766], [9, 0xa7ce], [9, 0xa8a6],
  [22, 0xb786],
  [23, 0xb960], [23, 0xc04a],
  [21, 0xcc5a], [21, 0xcc76], [21, 0xce92], [21, 0xceda],
  [21, 0xcfbe], [21, 0xd05a], [21, 0xd16a], [21, 0xd206],
  [21, 0xd252], [21, 0xd2ee], [21, 0xd696], [21, 0xd6e2],
  [21, 0xdbde],
].map(([trackIndex, callFileOffset]) => Object.freeze({
  trackIndex,
  callFileOffset,
})));
const OPENING_FACE_CLIP_INITIAL_CALLS = Object.freeze(new Set([
  0x0d52,
  0x157e, 0x159a,
  0x23ba,
  0x266a, 0x2686,
  0x73d6, 0x73f2,
  0x8ae6,
  0x8fd2, 0x8fee,
  0x95ce,
  0xb786,
  0xb960,
  0xcc5a, 0xcc76,
]));

// Two native activity loops vary the 0x0113 selector on every frame instead
// of enclosing each call in a single frame-equality block. Preserve their
// exact ranges and bit tests before expanding them into the 30 Hz timeline.
const OPENING_FACE_CLIP_RANGED_CALLS = Object.freeze([
  Object.freeze({
    trackIndex: 3,
    callFileOffset: 0x3416,
    firstFrame: 328,
    lastFrame: 396,
    frameMask: 4,
    maskedValue: 4,
  }),
  Object.freeze({
    trackIndex: 3,
    callFileOffset: 0x3446,
    firstFrame: 328,
    lastFrame: 396,
    frameMask: 4,
    maskedValue: 0,
  }),
  Object.freeze({
    trackIndex: 8,
    callFileOffset: 0xa496,
    firstFrame: 123,
    lastFrame: 179,
    frameMask: 2,
    maskedValue: 2,
  }),
  Object.freeze({
    trackIndex: 8,
    callFileOffset: 0xa4ee,
    firstFrame: 123,
    lastFrame: 179,
    frameMask: 2,
    maskedValue: 0,
  }),
]);

// Operation 0x0099 is the FACE world-target controller, separate from TALK
// clip selection. The definitions below cover the exact, single-frame calls
// whose ownership is statically proven by the A0114 activity frame guards.
// World points retain their literal writes; actor-component points retain the
// preceding operation-0x0019 query plus any authored world-vector offset.
const OPENING_FACE_GAZE_CALLS = Object.freeze([
  Object.freeze({
    trackIndex: 4,
    callFileOffset: 0x7684,
    mode: 2,
    targetLocalOffset: 8,
    actorComponent: Object.freeze({
      queryCallFileOffset: 0x7640,
      actorTag: "SORY",
      selector: 5,
      associated: true,
      offset: Object.freeze([0, 0.2, 0]),
      offsetLiteralOffsets: Object.freeze([null, 0x7698, null]),
    }),
  }),
  Object.freeze({ trackIndex: 4, callFileOffset: 0x76d2, mode: 0 }),
  Object.freeze({ trackIndex: 4, callFileOffset: 0x7716, mode: 0 }),
  Object.freeze({
    trackIndex: 5,
    callFileOffset: 0x9196,
    mode: 2,
    targetLocalOffset: 32,
    vectorWrites: Object.freeze([
      Object.freeze([0x9140, 0x9142, 0x91a4]),
      Object.freeze([0x914e, 0x9150, 0x91a8]),
      Object.freeze([0x915c, 0x915e, 0x91ac]),
    ]),
  }),
  Object.freeze({
    trackIndex: 5,
    callFileOffset: 0x931e,
    mode: 2,
    targetLocalOffset: 32,
    vectorWrites: Object.freeze([
      Object.freeze([0x92e4, 0x92e6, 0x9348]),
      Object.freeze([0x92f2, 0x92f4, 0x934c]),
      Object.freeze([0x9300, 0x9302, 0x9350]),
    ]),
  }),
  Object.freeze({
    trackIndex: 5,
    callFileOffset: 0x9446,
    mode: 0,
  }),
  Object.freeze({
    trackIndex: 9,
    callFileOffset: 0xa6e0,
    mode: 2,
    targetLocalOffset: 24,
    actorComponent: Object.freeze({
      queryCallFileOffset: 0xa6c2,
      actorTag: "IWAO",
      selector: -1,
      associated: false,
      offset: Object.freeze([0, 0, 0]),
    }),
  }),
  Object.freeze({ trackIndex: 9, callFileOffset: 0xa77a, mode: 0 }),
  Object.freeze({
    trackIndex: 11,
    callFileOffset: 0xafc2,
    mode: 2,
    targetLocalOffset: 8,
    vectorWrites: Object.freeze([
      Object.freeze([0xaf88, 0xaf8a, 0xafd8]),
      Object.freeze([0xaf96, 0xaf98, 0xafdc]),
      Object.freeze([0xafa4, 0xafa6, 0xafe0]),
    ]),
  }),
  Object.freeze({ trackIndex: 11, callFileOffset: 0xb05e, mode: 0 }),
  Object.freeze({
    trackIndex: 21,
    callFileOffset: 0xd74e,
    mode: 2,
    targetLocalOffset: 20,
    actorComponent: Object.freeze({
      queryCallFileOffset: 0xd730,
      actorTag: "IWAO",
      selector: 2,
      associated: false,
      offset: Object.freeze([0, 0, 0]),
    }),
  }),
  Object.freeze({ trackIndex: 21, callFileOffset: 0xd796, mode: 0 }),
  ...[
    [0xd83e, 0xd820, 27],
    [0xd8ae, 0xd890, 5],
    [0xd91e, 0xd900, 20],
    [0xd98e, 0xd970, 5],
    [0xd9fe, 0xd9e0, 20],
    [0xda6e, 0xda50, 5],
  ].map(([callFileOffset, queryCallFileOffset, selector]) => Object.freeze({
    trackIndex: 21,
    callFileOffset,
    mode: 2,
    targetLocalOffset: 20,
    actorComponent: Object.freeze({
      queryCallFileOffset,
      actorTag: "IWAO",
      selector,
      associated: false,
      offset: Object.freeze([0, 0, 0]),
    }),
  })),
  Object.freeze({ trackIndex: 21, callFileOffset: 0xdab6, mode: 0 }),
]);
const HAND_POSE_STATIC_BASE_OFFSET = 0x205a0;
const HAND_POSE_VECTOR_COUNT = 19;

// Operation 0x0081 drives the lower-detail MHND nodes embedded in the body
// HRCM. These calls are distinct from the separate high-detail HAND resources
// above. Their exact authored target rows provide the relaxed finger pose at
// the beginning of A0114, before any close-up HAND controller is requested.
const OPENING_BODY_HAND_POSE_CALLS = Object.freeze([
  [0, 0, 0x0d6e],
  [1, 0, 0x15d2],
  [1, 400, 0x18f2],
  [1, 443, 0x19e2],
  [1, 810, 0x1df6],
  [2, 0, 0x23d6],
  [3, 0, 0x26a2],
  [18, 0, 0x78a6],
  [18, 680, 0x8566],
  [5, 0, 0x9046],
  [7, 0, 0x9ae6],
  [8, 0, 0x9f6a],
  [9, 0, 0xa624],
  [10, 0, 0xac96],
  [11, 0, 0xaee6],
].map(([trackIndex, frame, callFileOffset]) => Object.freeze({
  trackIndex,
  frame,
  callFileOffset,
})));

// 0x9dea executes after track 7's AUTH completion and is immediately
// superseded by track 8's frame-zero 0x0081 request before another native
// MHND update. It is retained as an explicit extraction boundary instead of
// being assigned a fabricated AUTH frame.
const OPENING_BODY_HAND_SUPERSEDED_CALL = 0x9dea;

// These are the contiguous AUTH tracks whose exact ASTR references identify
// the A0114 opening. Later OP00 tracks belong to other events and inserts.
const OPENING_FIRST_TRACK_OFFSET = 0x22ae4;
const OPENING_TRACK_COUNT = 24;
const EXPECTED_OPENING_END_OFFSET = 0x481f4;
const EXPECTED_ACTOR_TAGS = Object.freeze([
  "AKIR", "FUKU", "INE_", "IWAO", "KNBS", "KNBU", "KURA",
  "KURB", "MNLF", "ODR1", "ODR2", "RMJN", "SORY",
]);
const REQUIRED_ENVIRONMENT_MODELS = Object.freeze([
  "OMO", "JIMENHAL", "NAIB", "NIWAKAL", "OMADO", "OOSAKI", "JYUU",
]);
// OP99 AFS entry 27 is one of several MAP packages used by the opening.
// Its child order is exact archive evidence, but it is not the native 0x0098
// slot order: the executable assigns those slots as resources are registered.
const OPENING_LAYERED_PACKAGE_MODELS = Object.freeze([
  "JIMENHAL", "NAIB", "NIWAKAL", "OMADO",
]);
// OMADO is the small window/wall cutaway that obstructs an authored pullback
// when every extracted model is rendered at once. Keep this browser override
// explicitly separate from the unresolved native slot-to-model identity.
const OPENING_BROWSER_MAP_VISIBILITY = Object.freeze([
  Object.freeze({ nativeName: "OMADO", visible: false }),
]);
const OPENING_TRACK_MAP_LAYER_SETUPS = Object.freeze([
  { trackIndex: 0, activityCall: 0x15b80, launchCall: 0x15b50, functionOffset: 0x0bf0,
    writes: [[0, 0, 0x0c46], [1, 0, 0x0c5a], [2, 0, 0x0c6e], [3, 0, 0x0c82], [4, 1, 0x0c96]] },
  { trackIndex: 1, activityCall: 0x15d50, launchCall: 0x15d20, functionOffset: 0x14a8,
    writes: [[0, 1, 0x14be], [1, 0, 0x14d2], [2, 0, 0x14e6], [3, 0, 0x14fa]] },
  { trackIndex: 2, activityCall: 0x16082, launchCall: 0x16052, functionOffset: 0x22d0,
    writes: [[0, 1, 0x22e6], [1, 0, 0x22fa], [2, 0, 0x230e], [3, 0, 0x2322], [4, 1, 0x2336]] },
  { trackIndex: 3, activityCall: 0x1633e, launchCall: 0x1630e, functionOffset: 0x2594,
    writes: [[0, 1, 0x25aa], [1, 1, 0x25be], [2, 0, 0x25d2], [3, 0, 0x25e6]] },
  { trackIndex: 4, activityCall: 0x1816a, launchCall: 0x18152, functionOffset: 0x72e0,
    writes: [[0, 0, 0x72f6], [1, 1, 0x730a], [2, 1, 0x731e], [3, 0, 0x7332]] },
  { trackIndex: 5, activityCall: 0x18874, launchCall: 0x1885c, functionOffset: 0x8ecc,
    writes: [[0, 0, 0x8ee2], [1, 1, 0x8ef6], [2, 1, 0x8f0a], [3, 0, 0x8f1e]] },
  { trackIndex: 6, activityCall: 0x18a40, launchCall: 0x18a28, functionOffset: 0x94a4,
    writes: [[0, 0, 0x94ba], [1, 1, 0x94ce], [2, 1, 0x94e2], [3, 0, 0x94f6]] },
  { trackIndex: 7, activityCall: 0x18c0c, launchCall: 0x18bf4, functionOffset: 0x9930,
    writes: [[0, 0, 0x9946], [1, 1, 0x995a], [2, 1, 0x996e], [3, 0, 0x9982]] },
  { trackIndex: 8, activityCall: 0x18e64, launchCall: 0x18e4c, functionOffset: 0x9e5c,
    writes: [[0, 0, 0x9e72], [1, 1, 0x9e86], [2, 1, 0x9e9a], [3, 0, 0x9eae]] },
  { trackIndex: 9, activityCall: 0x18fa4, launchCall: 0x18f8c, functionOffset: 0xa548,
    writes: [[0, 0, 0xa55e], [1, 1, 0xa572], [2, 1, 0xa586], [3, 0, 0xa59a]] },
  { trackIndex: 10, activityCall: 0x190e4, launchCall: 0x190cc, functionOffset: 0xabb0,
    writes: [[0, 0, 0xabc6], [1, 1, 0xabda], [2, 1, 0xabee], [3, 0, 0xac02]] },
  { trackIndex: 11, activityCall: 0x191a0, launchCall: 0x19188, functionOffset: 0xae0c,
    writes: [[0, 0, 0xae22], [1, 1, 0xae36], [2, 1, 0xae4a], [3, 0, 0xae5e]] },
  { trackIndex: 12, activityCall: 0x192d8, launchCall: 0x192c0, functionOffset: 0xb120,
    writes: [[0, 0, 0xb136], [1, 1, 0xb14a], [2, 1, 0xb15e], [3, 0, 0xb172]] },
  { trackIndex: 13, activityCall: 0x1950a, inheritedFromTrackIndex: 12, writes: [] },
  { trackIndex: 14, activityCall: 0x1994c, launchCall: 0x19934, functionOffset: 0xc1d4,
    writes: [[0, 0, 0xc1ea], [1, 1, 0xc1fe], [2, 1, 0xc212], [3, 0, 0xc226]] },
  { trackIndex: 15, activityCall: 0x19d20, launchCall: 0x19d08, functionOffset: 0xc3d4,
    writes: [[0, 1, 0xc3ea], [1, 1, 0xc3fe], [2, 1, 0xc412], [3, 0, 0xc426]] },
  { trackIndex: 16, activityCall: 0x19fde, inheritedFromTrackIndex: 15, writes: [] },
  { trackIndex: 17, activityCall: 0x1a198, launchCall: 0x1a180, functionOffset: 0xc700,
    writes: [[0, 0, 0xc716], [1, 1, 0xc72a], [2, 1, 0xc73e], [3, 0, 0xc752]] },
  { trackIndex: 18, activityCall: 0x183c4, launchCall: 0x183ac, functionOffset: 0x77e8,
    writes: [[0, 0, 0x77fe], [1, 1, 0x7812], [2, 1, 0x7826], [3, 0, 0x783a]] },
  { trackIndex: 19, activityCall: 0x1861c, launchCall: 0x18604, functionOffset: 0x89c8,
    writes: [[0, 0, 0x89de], [1, 1, 0x89f2], [2, 1, 0x8a06], [3, 0, 0x8a1a]] },
  { trackIndex: 20, activityCall: 0x1a324, launchCall: 0x1a2f4, functionOffset: 0xb3f8,
    writes: [[0, 0, 0xb40e], [1, 1, 0xb422], [2, 1, 0xb436], [3, 0, 0xb44a]] },
  { trackIndex: 21, activityCall: 0x1a65c, launchCall: 0x1a644, functionOffset: 0xcb9c,
    writes: [[0, 0, 0xcbb2], [1, 1, 0xcbc6], [2, 1, 0xcbda], [3, 0, 0xcbee]] },
  { trackIndex: 22, activityCall: 0x19750, launchCall: 0x19738, functionOffset: 0xb6c8,
    writes: [[0, 0, 0xb6de], [1, 1, 0xb6f2], [2, 1, 0xb706], [3, 0, 0xb71a]] },
  { trackIndex: 23, activityCall: 0x19890, launchCall: 0x19878, functionOffset: 0xb898,
    writes: [[0, 0, 0xb8ae], [1, 1, 0xb8c2], [2, 1, 0xb8d6], [3, 0, 0xb8ea]] },
]);
// TRCK resources stay indexed by their native map-embedded slots. Scene
// chronology belongs exclusively to the compiled room-script owner; package
// metadata must never encode a second, handwritten playback order.
function openingNativeActivitySetups() {
  return [...OPENING_TRACK_MAP_LAYER_SETUPS].sort(
    (left, right) => left.activityCall - right.activityCall,
  );
}
// Exact between-AUTH room-script writes that present persistent scene objects.
// Operation 0x001f mode 1 sets the resolved-object runtime flag; operation
// 0x00a8 mode 1 sets its associated presentation flag and restores scheduling.
const OPENING_SCENE_OBJECT_TRANSITIONS = Object.freeze([
  Object.freeze({ actorTag: "MNLF", beforeTrackIndex: 0, presented: true,
    runtimeFlagCall: 0x159b2, presentationFlagCall: 0x159d6 }),
  Object.freeze({ actorTag: "RMJN", beforeTrackIndex: 0, presented: true,
    runtimeFlagCall: 0x15aca, presentationFlagCall: 0x15aee }),
  Object.freeze({ actorTag: "ODR1", beforeTrackIndex: 2, presented: true,
    runtimeFlagCall: 0x15ec6, presentationFlagCall: 0x15eea }),
  Object.freeze({ actorTag: "ODR2", beforeTrackIndex: 2, presented: true,
    runtimeFlagCall: 0x15f52, presentationFlagCall: 0x15f76 }),
  Object.freeze({ actorTag: "ODR1", beforeTrackIndex: 4, presented: true,
    runtimeFlagCall: 0x17c12, presentationFlagCall: 0x17c36 }),
  Object.freeze({ actorTag: "ODR2", beforeTrackIndex: 4, presented: true,
    runtimeFlagCall: 0x17c9e, presentationFlagCall: 0x17cc2 }),
]);
const REQUIRED_CHARACTER_MODELS = Object.freeze([
  "INE_M", "FUK_M", "BLA_M", "BLB_M", "IWA_M", "KOK_M",
]);
const REQUIRED_SCENE_OBJECTS = Object.freeze({
  KNBS: Object.freeze({ image: "KANBANS", model: "YUKS502G" }),
  KNBU: Object.freeze({ image: "KANBANU", model: "YUKS503G" }),
  MNLF: Object.freeze({ image: "MONLEFT", model: "B023H01G" }),
  ODR1: Object.freeze({ image: "DOOR_L", model: "DDRR1002" }),
  ODR2: Object.freeze({ image: "DOOR_R", model: "DDRR1001" }),
  RMJN: Object.freeze({ image: "RMJN", model: "BMWS703G" }),
});
const REQUIRED_SCENE_OBJECT_MODELS = Object.freeze([
  ...new Set(Object.values(REQUIRED_SCENE_OBJECTS).map(value => value.model)),
]);
// RYUK is not an AUTH actor. The OP00 script creates a native FIXO attachment
// for it during tracks 15, 17, and 20, so it must be recovered independently
// of the ASEQ/AMOV actor inventory.
const REQUIRED_ATTACHED_OBJECTS = Object.freeze({
  RYUK: Object.freeze({
    image: "RYUKYO",
    model: "DRGS502G",
    attachments: Object.freeze([
      Object.freeze({
        callFileOffset: 0xb59e,
        operationLiteralOffset: 0xb61c,
        actorLiteralOffset: 0xb618,
        parentActorTag: "SORY",
        parentLiteralOffset: 0xb5fc,
        controlId: 12,
        controlInstructionOffset: 0xb588,
        translationSources: Object.freeze([
          Object.freeze({ literalOffset: 0xb608 }),
          Object.freeze({ value: 0, instructionOffset: 0xb546 }),
          Object.freeze({ literalOffset: 0xb60c }),
        ]),
        rotationSources: Object.freeze([
          Object.freeze({ literalOffset: 0xb610 }),
          Object.freeze({ value: 0, instructionOffset: 0xb56c }),
          Object.freeze({ literalOffset: 0xb614 }),
        ]),
      }),
      Object.freeze({
        callFileOffset: 0xc536,
        operationLiteralOffset: 0xc578,
        actorLiteralOffset: 0xc574,
        parentActorTag: "KURA",
        parentLiteralOffset: 0xc570,
        controlId: 18,
        controlInstructionOffset: 0xc520,
        translationSources: Object.freeze([
          Object.freeze({ literalOffset: 0xc558 }),
          Object.freeze({ literalOffset: 0xc55c }),
          Object.freeze({ literalOffset: 0xc560 }),
        ]),
        rotationSources: Object.freeze([
          Object.freeze({ literalOffset: 0xc564 }),
          Object.freeze({ literalOffset: 0xc568 }),
          Object.freeze({ literalOffset: 0xc56c }),
        ]),
      }),
      Object.freeze({
        callFileOffset: 0xc89e,
        operationLiteralOffset: 0xc8e0,
        actorLiteralOffset: 0xc8dc,
        parentActorTag: "SORY",
        parentLiteralOffset: 0xc8b8,
        controlId: 12,
        controlInstructionOffset: 0xc888,
        translationSources: Object.freeze([
          Object.freeze({ literalOffset: 0xc8c4 }),
          Object.freeze({ literalOffset: 0xc8c8 }),
          Object.freeze({ literalOffset: 0xc8cc }),
        ]),
        rotationSources: Object.freeze([
          Object.freeze({ literalOffset: 0xc8d0 }),
          Object.freeze({ literalOffset: 0xc8d4 }),
          Object.freeze({ literalOffset: 0xc8d8 }),
        ]),
      }),
    ]),
  }),
});
const REQUIRED_ATTACHED_OBJECT_MODELS = Object.freeze([
  ...new Set(Object.values(REQUIRED_ATTACHED_OBJECTS).map(value => value.model)),
]);
const MODEL_EXTENSIONS = new Set(["CHRM", "MAPM", "PROP"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function ascii(bytes, start, end) {
  return bytes.subarray(start, end).toString("ascii");
}

function cleanAscii(bytes, start, end) {
  return ascii(bytes, start, end).replace(/[\0 ]+$/g, "");
}

function relative(filename) {
  return path.relative(repoRoot, filename).split(path.sep).join("/");
}

function readPinnedSource(filename) {
  const sourcePath = path.join(sourceDirectory, filename);
  const bytes = readFileSync(sourcePath);
  const expected = SOURCE_EXPECTATIONS[filename];
  if (bytes.length !== expected.byteLength || sha256(bytes) !== expected.sha256) {
    throw new Error(`OP00 source ${filename} changed`);
  }
  return bytes;
}

function readPinnedFaceSource(filename) {
  const sourcePath = path.join(faceSourceDirectory, filename);
  const bytes = readFileSync(sourcePath);
  const expected = FACE_SOURCE_EXPECTATIONS[filename];
  if (!expected || bytes.length !== expected.byteLength || sha256(bytes) !== expected.sha256) {
    throw new Error(`OP00 FACE source ${filename} changed`);
  }
  return bytes;
}

function readPinnedHandSource(filename) {
  const sourcePath = path.join(handSourceDirectory, filename);
  const bytes = readFileSync(sourcePath);
  const expected = HAND_SOURCE_EXPECTATIONS[filename];
  if (!expected || bytes.length !== expected.byteLength || sha256(bytes) !== expected.sha256) {
    throw new Error(`OP00 HAND source ${filename} changed`);
  }
  return bytes;
}

function validateHandRig(bytes, filename) {
  if (bytes.length < 24) throw new Error(`${filename} has no HAND rig header`);
  const offsets = Array.from({ length: 6 }, (_, index) => (
    bytes.readUInt32LE(index * 4)
  ));
  if (
    offsets[0] !== 0x18
    || offsets[1] - offsets[0] !== 72 * 2
    || offsets[3] - offsets[1] !== 71 * 80
    || offsets.some(offset => offset < 0x18 || offset > bytes.length)
    || offsets[2] < offsets[4]
    || offsets[5] < offsets[2]
    || offsets[5] > bytes.length
  ) {
    throw new Error(`${filename} has an unexpected HAND rig layout`);
  }
  const influenceCounts = bytes.subarray(offsets[2], offsets[5]);
  if (influenceCounts.length < 306) {
    throw new Error(`${filename} has fewer than 306 vertex influence counts`);
  }
  return Object.freeze({
    transformNodeCount: 71,
    vertexCount: 306,
    pointerOffsets: offsets,
  });
}

function offsetHex(value) {
  return `0x${value.toString(16)}`;
}

function pcRelativeLong(bytes, instructionOffset, register) {
  const instruction = bytes.readUInt16LE(instructionOffset);
  if ((instruction & 0xff00) !== (0xd000 | (register << 8))) {
    throw new Error(
      `OP00 expected a PC-relative r${register} load at ${offsetHex(instructionOffset)}`,
    );
  }
  const literalOffset = ((instructionOffset + 4) & ~3) + (instruction & 0xff) * 4;
  return {
    literalOffset,
    value: bytes.readUInt32LE(literalOffset),
  };
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function immediateRegister(bytes, instructionOffset, register, label) {
  const instruction = bytes.readUInt16LE(instructionOffset);
  if ((instruction & 0xff00) !== (0xe000 | (register << 8))) {
    throw new Error(
      `OP00 expected ${label} in r${register} at ${offsetHex(instructionOffset)}`,
    );
  }
  return signedByte(instruction & 0xff);
}

function recoverHandPoseCall(bytes, definition) {
  const call = definition.callFileOffset;
  const expectedInstructions = [
    [call - 24, 0x5581], // static-data base
    [call - 20, 0x351c], // pose-table relative offset
    [call - 14, 0x2d46],
    [call - 12, 0x2d56],
    [call - 10, 0x2d66],
    [call - 8, 0x2d76],
    [call - 6, 0xe55e], // operation 0x005e
    [call - 4, 0x508a],
    [call - 2, 0x548d],
    [call, 0x400b],
  ];
  for (const [instructionOffset, expected] of expectedInstructions) {
    if (bytes.readUInt16LE(instructionOffset) !== expected) {
      throw new Error(`OP00 HAND call changed at ${offsetHex(call)}`);
    }
  }
  const durationNativeTicks = immediateRegister(
    bytes,
    call - 26,
    4,
    "HAND duration",
  );
  const sideSelector = immediateRegister(
    bytes,
    call - 18,
    6,
    "HAND side selector",
  );
  const relativePoseTable = pcRelativeLong(bytes, call - 22, 1);
  const actor = pcRelativeLong(bytes, call - 16, 7);
  const actorBytes = Buffer.allocUnsafe(4);
  actorBytes.writeUInt32LE(actor.value);
  const actorTag = actorBytes.toString("ascii");
  const poseTableOffset = HAND_POSE_STATIC_BASE_OFFSET + relativePoseTable.value;
  if (
    durationNativeTicks < 1
    || (sideSelector !== 0 && sideSelector !== 1)
    || !REQUIRED_HAND_ASSETS[actorTag]
    || poseTableOffset < HAND_POSE_STATIC_BASE_OFFSET
    || poseTableOffset + HAND_POSE_VECTOR_COUNT * 12 > bytes.length
  ) {
    throw new Error(`OP00 HAND arguments changed at ${offsetHex(call)}`);
  }
  const vectors = Array.from({ length: HAND_POSE_VECTOR_COUNT }, (_, index) => (
    Object.freeze([0, 1, 2].map(axis => (
      bytes.readInt32LE(poseTableOffset + index * 12 + axis * 4)
    )))
  ));
  return Object.freeze({
    actorTag,
    side: sideSelector === 0 ? "left" : "right",
    sideSelector,
    poseTableOffset,
    durationNativeTicks,
    callFileOffset: call,
    vectors: Object.freeze(vectors),
  });
}

function recoverFaceClipCall(bytes, definition) {
  const call = definition.callFileOffset;
  const expectedInstructions = [
    [call - 14, 0x2d46],
    [call - 12, 0x2d56],
    [call - 10, 0x2d66],
    [call - 8, 0x2d76],
    [call - 4, 0x508a],
    [call - 2, 0x548d],
    [call, 0x400b],
  ];
  for (const [instructionOffset, expected] of expectedInstructions) {
    if (bytes.readUInt16LE(instructionOffset) !== expected) {
      throw new Error(`OP00 FACE clip call changed at ${offsetHex(call)}`);
    }
  }
  const durationNativeTicks = immediateRegister(
    bytes,
    call - 22,
    4,
    "FACE clip duration",
  );
  const selector = immediateRegister(
    bytes,
    call - 20,
    5,
    "FACE clip selector",
  );
  const clipGroup = immediateRegister(
    bytes,
    call - 18,
    6,
    "FACE clip group",
  );
  const actor = pcRelativeLong(bytes, call - 16, 7);
  const operation = pcRelativeLong(bytes, call - 6, 5);
  const actorBytes = Buffer.allocUnsafe(4);
  actorBytes.writeUInt32LE(actor.value);
  const actorTag = actorBytes.toString("ascii");
  if (
    operation.value !== 0x0113
    || !REQUIRED_FACIAL_ASSETS[actorTag]
    || clipGroup < 0
    || clipGroup * 6 + 1 > 79
    || selector < 0
    || clipGroup * 6 + selector > 79
    || durationNativeTicks < 1
  ) throw new Error(`OP00 FACE clip arguments changed at ${offsetHex(call)}`);
  return Object.freeze({
    actorTag,
    clipGroup,
    selector,
    durationNativeTicks,
    callFileOffset: call,
    operationLiteralOffset: operation.literalOffset,
  });
}

function recoverOpeningFaceClipTimeline(bytes) {
  const cues = Array.from({ length: OPENING_TRACK_COUNT }, () => []);
  for (const definition of OPENING_FACE_CLIP_CALLS) {
    const setup = OPENING_TRACK_MAP_LAYER_SETUPS.find(
      value => value.trackIndex === definition.trackIndex,
    );
    if (!setup?.functionOffset) {
      throw new Error(`OP00 FACE clip track ${definition.trackIndex} has no function`);
    }
    const call = recoverFaceClipCall(bytes, definition);
    const initial = OPENING_FACE_CLIP_INITIAL_CALLS.has(
      definition.callFileOffset,
    );
    const frame = initial
      ? 0
      : governingActivityFrame(
        bytes,
        setup.functionOffset,
        definition.callFileOffset,
      );
    cues[definition.trackIndex].push(Object.freeze({
      frame,
      actorTag: call.actorTag,
      clipGroup: call.clipGroup,
      selector: call.selector,
      durationNativeTicks: call.durationNativeTicks,
      callFileOffset: offsetHex(call.callFileOffset),
      operationLiteralOffset: offsetHex(call.operationLiteralOffset),
    }));
  }

  if (
    bytes.readUInt16LE(0x33bc) !== 0x54e8
    || pcRelativeLong(bytes, 0x33be, 5).value !== 327
    || bytes.readUInt16LE(0x33c4) !== 0x55e8
    || pcRelativeLong(bytes, 0x33c6, 6).value !== 397
    || bytes.readUInt16LE(0x33e8) !== 0x54e8
    || bytes.readUInt16LE(0x33ea) !== 0xe504
    || bytes.readUInt16LE(0x33ec) !== 0x2459
    || bytes.readUInt16LE(0xa41a) !== 0x54e4
    || bytes.readUInt16LE(0xa41c) !== 0xe57a
    || bytes.readUInt16LE(0xa422) !== 0x55e4
    || pcRelativeLong(bytes, 0xa424, 6).value !== 180
    || bytes.readUInt16LE(0xa448) !== 0x54e4
    || bytes.readUInt16LE(0xa44a) !== 0xe502
    || bytes.readUInt16LE(0xa44c) !== 0x2459
  ) throw new Error("OP00 FACE clip ranges changed");

  for (const definition of OPENING_FACE_CLIP_RANGED_CALLS) {
    const call = recoverFaceClipCall(bytes, definition);
    for (
      let frame = definition.firstFrame;
      frame <= definition.lastFrame;
      frame += 1
    ) {
      if ((frame & definition.frameMask) !== definition.maskedValue) continue;
      cues[definition.trackIndex].push(Object.freeze({
        frame,
        actorTag: call.actorTag,
        clipGroup: call.clipGroup,
        selector: call.selector,
        durationNativeTicks: call.durationNativeTicks,
        callFileOffset: offsetHex(call.callFileOffset),
        operationLiteralOffset: offsetHex(call.operationLiteralOffset),
      }));
    }
  }
  for (const trackCues of cues) {
    trackCues.sort((left, right) => (
      left.frame - right.frame
      || left.callFileOffset.localeCompare(right.callFileOffset)
    ));
  }
  return Object.freeze(cues.map(value => Object.freeze(value)));
}

function recoverFaceGazeCall(bytes, definition) {
  const call = definition.callFileOffset;
  if (definition.mode === 0) {
    const actor = pcRelativeLong(bytes, call - 12, 5);
    const operation = pcRelativeLong(bytes, call - 6, 5);
    if (
      bytes.readUInt16LE(call - 14) !== 0xe400
      || bytes.readUInt16LE(call - 10) !== 0x2d46
      || bytes.readUInt16LE(call - 8) !== 0x2d56
      || bytes.readUInt16LE(call - 4) !== 0x508a
      || bytes.readUInt16LE(call - 2) !== 0x548d
      || bytes.readUInt16LE(call) !== 0x400b
      || operation.value !== 0x0099
    ) throw new Error(`OP00 FACE gaze reset changed at ${offsetHex(call)}`);
    const actorBytes = Buffer.allocUnsafe(4);
    actorBytes.writeUInt32LE(actor.value);
    const actorTag = actorBytes.toString("ascii");
    if (!REQUIRED_FACIAL_ASSETS[actorTag]) {
      throw new Error(`OP00 FACE gaze actor changed at ${offsetHex(call)}`);
    }
    return Object.freeze({
      actorTag,
      mode: 0,
      durationNativeTicks: 16,
      target: null,
      callFileOffset: call,
      operationLiteralOffset: operation.literalOffset,
      actorLiteralOffset: actor.literalOffset,
      vectorLiteralOffsets: [],
    });
  }

  const expectedInstructions = [
    [call - 20, 0x35ec],
    [call - 18, 0xe602],
    [call - 14, 0x2d46],
    [call - 12, 0x2d56],
    [call - 10, 0x2d66],
    [call - 8, 0x2d76],
    [call - 4, 0x508a],
    [call - 2, 0x548d],
    [call, 0x400b],
  ];
  for (const [instructionOffset, expected] of expectedInstructions) {
    if (bytes.readUInt16LE(instructionOffset) !== expected) {
      throw new Error(`OP00 FACE gaze call changed at ${offsetHex(call)}`);
    }
  }
  const durationNativeTicks = immediateRegister(
    bytes,
    call - 24,
    4,
    "FACE gaze duration",
  );
  const targetLocalOffset = immediateRegister(
    bytes,
    call - 22,
    5,
    "FACE gaze target local offset",
  );
  const actor = pcRelativeLong(bytes, call - 16, 7);
  const operation = pcRelativeLong(bytes, call - 6, 5);
  const actorBytes = Buffer.allocUnsafe(4);
  actorBytes.writeUInt32LE(actor.value);
  const actorTag = actorBytes.toString("ascii");
  if (
    operation.value !== 0x0099
    || targetLocalOffset !== definition.targetLocalOffset
    || !REQUIRED_FACIAL_ASSETS[actorTag]
    || durationNativeTicks < 1
  ) throw new Error(`OP00 FACE gaze arguments changed at ${offsetHex(call)}`);

  const vectorLiteralOffsets = (definition.vectorWrites || []).map(
    ([loadOffset, storeOffset, expectedLiteralOffset]) => {
      const source = pcRelativeLong(bytes, loadOffset, 5);
      if (
        source.literalOffset !== expectedLiteralOffset
        || bytes.readUInt16LE(storeOffset) !== 0x2452
      ) throw new Error(`OP00 FACE gaze vector changed at ${offsetHex(call)}`);
      return source.literalOffset;
    },
  );
  const position = vectorLiteralOffsets.map(offset => bytes.readFloatLE(offset));
  if (!position.every(Number.isFinite)) {
    throw new Error(`OP00 FACE gaze vector is invalid at ${offsetHex(call)}`);
  }
  let target = definition.vectorWrites
    ? Object.freeze({
        kind: "world-point",
        position: Object.freeze(position),
      })
    : null;
  let targetSource = null;
  if (definition.actorComponent) {
    if (definition.vectorWrites) {
      throw new Error(`OP00 FACE gaze has conflicting targets at ${offsetHex(call)}`);
    }
    const component = definition.actorComponent;
    const queryCall = component.queryCallFileOffset;
    const expectedQueryInstructions = [
      [queryCall - 20, 0x35ec],
      [queryCall - 14, 0x2d46],
      [queryCall - 12, 0x2d56],
      [queryCall - 10, 0x2d66],
      [queryCall - 8, 0x2d76],
      [queryCall - 6, 0xe519],
      [queryCall - 4, 0x508a],
      [queryCall - 2, 0x548d],
      [queryCall, 0x400b],
    ];
    for (const [instructionOffset, expected] of expectedQueryInstructions) {
      if (bytes.readUInt16LE(instructionOffset) !== expected) {
        throw new Error(`OP00 FACE gaze source changed at ${offsetHex(queryCall)}`);
      }
    }
    const flags = component.associated
      ? pcRelativeLong(bytes, queryCall - 24, 4).value
      : immediateRegister(bytes, queryCall - 24, 4, "FACE gaze source flags");
    const queryLocalOffset = immediateRegister(
      bytes,
      queryCall - 22,
      5,
      "FACE gaze source local offset",
    );
    const selector = immediateRegister(
      bytes,
      queryCall - 18,
      6,
      "FACE gaze source selector",
    );
    const queryActor = pcRelativeLong(bytes, queryCall - 16, 7);
    const queryActorBytes = Buffer.allocUnsafe(4);
    queryActorBytes.writeUInt32LE(queryActor.value);
    const queryActorTag = queryActorBytes.toString("ascii");
    if (
      flags !== (component.associated ? 0x40000000 : 0)
      || queryLocalOffset !== definition.targetLocalOffset
      || selector !== component.selector
      || queryActorTag !== component.actorTag
    ) throw new Error(`OP00 FACE gaze source arguments changed at ${offsetHex(queryCall)}`);
    const offsetLiteralOffsets = component.offsetLiteralOffsets
      || [null, null, null];
    for (const [index, literalOffset] of offsetLiteralOffsets.entries()) {
      if (literalOffset === null) {
        if (component.offset[index] !== 0) {
          throw new Error(`OP00 FACE gaze offset lacks evidence at ${offsetHex(call)}`);
        }
      } else if (
        bytes.readFloatLE(literalOffset) !== Math.fround(component.offset[index])
      ) {
        throw new Error(`OP00 FACE gaze offset changed at ${offsetHex(call)}`);
      }
    }
    target = Object.freeze({
      kind: "actor-component",
      actorTag: component.actorTag,
      selector: component.selector,
      associated: component.associated,
      offset: component.offset,
    });
    targetSource = Object.freeze({
      operation: "0x0019",
      queryCallFileOffset: queryCall,
      actorLiteralOffset: queryActor.literalOffset,
      offsetLiteralOffsets: Object.freeze(offsetLiteralOffsets),
    });
  }
  if (!target) {
    throw new Error(`OP00 FACE gaze target is missing at ${offsetHex(call)}`);
  }
  return Object.freeze({
    actorTag,
    mode: 2,
    durationNativeTicks,
    target,
    targetSource,
    callFileOffset: call,
    operationLiteralOffset: operation.literalOffset,
    actorLiteralOffset: actor.literalOffset,
    vectorLiteralOffsets: Object.freeze(vectorLiteralOffsets),
  });
}

function recoverOpeningFaceGazeTimeline(bytes) {
  const cues = Array.from({ length: OPENING_TRACK_COUNT }, () => []);
  for (const definition of OPENING_FACE_GAZE_CALLS) {
    const setup = OPENING_TRACK_MAP_LAYER_SETUPS.find(
      value => value.trackIndex === definition.trackIndex,
    );
    if (!setup?.functionOffset) {
      throw new Error(`OP00 FACE gaze track ${definition.trackIndex} has no function`);
    }
    const call = recoverFaceGazeCall(bytes, definition);
    cues[definition.trackIndex].push(Object.freeze({
      frame: governingActivityFrame(
        bytes,
        setup.functionOffset,
        definition.callFileOffset,
      ),
      actorTag: call.actorTag,
      mode: call.mode,
      durationNativeTicks: call.durationNativeTicks,
      ...(call.target ? { target: call.target } : {}),
      callFileOffset: offsetHex(call.callFileOffset),
      operationLiteralOffset: offsetHex(call.operationLiteralOffset),
      actorLiteralOffset: offsetHex(call.actorLiteralOffset),
      vectorLiteralOffsets: call.vectorLiteralOffsets.map(offsetHex),
      ...(call.targetSource ? {
        targetSource: {
          operation: call.targetSource.operation,
          queryCallFileOffset: offsetHex(call.targetSource.queryCallFileOffset),
          actorLiteralOffset: offsetHex(call.targetSource.actorLiteralOffset),
          offsetLiteralOffsets: call.targetSource.offsetLiteralOffsets.map(
            offset => offset === null ? null : offsetHex(offset),
          ),
        },
      } : {}),
    }));
  }
  return Object.freeze(cues.map(value => Object.freeze(value)));
}

function recoverOpeningHandPoseTimeline(bytes) {
  const cues = Array.from({ length: OPENING_TRACK_COUNT }, () => []);
  const tables = new Map();
  const retainTable = (call) => {
    const key = offsetHex(call.poseTableOffset);
    const existing = tables.get(key);
    if (existing && JSON.stringify(existing.vectors) !== JSON.stringify(call.vectors)) {
      throw new Error(`OP00 HAND pose table ${key} changed during extraction`);
    }
    tables.set(key, Object.freeze({
      sourceMapinfoOffset: key,
      vectors: call.vectors,
    }));
    return key;
  };
  for (const definition of OPENING_HAND_POSE_CALLS) {
    const setup = OPENING_TRACK_MAP_LAYER_SETUPS.find(
      value => value.trackIndex === definition.trackIndex,
    );
    if (!setup?.functionOffset) {
      throw new Error(`OP00 HAND track ${definition.trackIndex} has no function`);
    }
    const call = recoverHandPoseCall(bytes, definition);
    cues[definition.trackIndex].push(Object.freeze({
      frame: governingActivityFrame(
        bytes,
        setup.functionOffset,
        definition.callFileOffset,
      ),
      actorTag: call.actorTag,
      side: call.side,
      poseTableOffset: retainTable(call),
      durationNativeTicks: call.durationNativeTicks,
      callFileOffset: offsetHex(call.callFileOffset),
    }));
  }
  // Validate the exact range and parity test which surrounds the two dynamic
  // track-8 call sites before expanding it to the browser's 30 Hz timeline.
  if (
    bytes.readUInt16LE(0xa41a) !== 0x54e4
    || bytes.readUInt16LE(0xa41c) !== 0xe57a
    || bytes.readUInt16LE(0xa422) !== 0x55e4
    || pcRelativeLong(bytes, 0xa424, 6).value !== 180
    || bytes.readUInt16LE(0xa448) !== 0x54e4
    || bytes.readUInt16LE(0xa44a) !== 0xe502
    || bytes.readUInt16LE(0xa44c) !== 0x2459
  ) {
    throw new Error("OP00 track-8 HAND pose range changed");
  }
  for (const definition of OPENING_HAND_POSE_RANGED_CALLS) {
    const call = recoverHandPoseCall(bytes, definition);
    const poseTableOffset = retainTable(call);
    for (
      let frame = definition.firstFrame;
      frame <= definition.lastFrame;
      frame += 1
    ) {
      if ((frame & definition.frameMask) !== definition.maskedValue) continue;
      cues[definition.trackIndex].push(Object.freeze({
        frame,
        actorTag: call.actorTag,
        side: call.side,
        poseTableOffset,
        durationNativeTicks: call.durationNativeTicks,
        callFileOffset: offsetHex(call.callFileOffset),
      }));
    }
  }
  for (const trackCues of cues) {
    trackCues.sort((left, right) => (
      left.frame - right.frame
      || left.callFileOffset.localeCompare(right.callFileOffset)
    ));
  }
  return Object.freeze({
    cues: Object.freeze(cues.map(value => Object.freeze(value))),
    tables: Object.freeze(Object.fromEntries(
      [...tables.entries()].sort(([left], [right]) => left.localeCompare(right)),
    )),
  });
}

function recoverBodyHandPoseCall(bytes, definition) {
  const call = definition.callFileOffset;
  const expectedInstructions = [
    [call - 14, 0x2d46],
    [call - 12, 0x2d56],
    [call - 10, 0x2d66],
    [call - 8, 0x2d76],
    [call - 4, 0x508a],
    [call - 2, 0x548d],
    [call, 0x400b],
  ];
  for (const [instructionOffset, expected] of expectedInstructions) {
    if (bytes.readUInt16LE(instructionOffset) !== expected) {
      throw new Error(`OP00 MHND call changed at ${offsetHex(call)}`);
    }
  }
  const durationNativeTicks = immediateRegister(
    bytes,
    call - 22,
    4,
    "MHND duration",
  );
  const targetIndex = immediateRegister(
    bytes,
    call - 20,
    5,
    "MHND target",
  );
  const channel = immediateRegister(bytes, call - 18, 6, "MHND channel");
  const actor = pcRelativeLong(bytes, call - 16, 7);
  const operation = pcRelativeLong(bytes, call - 6, 5);
  const actorBytes = Buffer.allocUnsafe(4);
  actorBytes.writeUInt32LE(actor.value);
  const actorTag = actorBytes.toString("ascii");
  if (
    operation.value !== 0x0081
    || !REQUIRED_HAND_ASSETS[actorTag]
    || channel < 0
    || channel > 2
    || targetIndex < 0
    || targetIndex >= 15
    || durationNativeTicks <= 1
  ) throw new Error(`OP00 MHND arguments changed at ${offsetHex(call)}`);
  return Object.freeze({
    frame: definition.frame,
    actorTag,
    channel,
    targetIndex,
    durationNativeTicks,
    callFileOffset: offsetHex(call),
    operationLiteralOffset: offsetHex(operation.literalOffset),
  });
}

function recoverOpeningBodyHandPoseTimeline(bytes) {
  const cues = Array.from({ length: OPENING_TRACK_COUNT }, () => []);
  for (const definition of OPENING_BODY_HAND_POSE_CALLS) {
    const setup = OPENING_TRACK_MAP_LAYER_SETUPS.find(
      value => value.trackIndex === definition.trackIndex,
    );
    if (!setup?.functionOffset) {
      throw new Error(`OP00 MHND track ${definition.trackIndex} has no function`);
    }
    if (
      definition.frame > 0
      && governingActivityFrame(
        bytes,
        setup.functionOffset,
        definition.callFileOffset,
      ) !== definition.frame
    ) {
      throw new Error(`OP00 MHND frame changed at ${offsetHex(definition.callFileOffset)}`);
    }
    cues[definition.trackIndex].push(recoverBodyHandPoseCall(bytes, definition));
  }
  const superseded = recoverBodyHandPoseCall(bytes, {
    trackIndex: 7,
    frame: null,
    callFileOffset: OPENING_BODY_HAND_SUPERSEDED_CALL,
  });
  if (
    superseded.actorTag !== "AKIR"
    || superseded.channel !== 2
    || superseded.targetIndex !== 6
    || superseded.durationNativeTicks !== 16
  ) throw new Error("OP00 superseded post-track MHND call changed");
  return Object.freeze({
    cues: Object.freeze(cues.map(value => Object.freeze(value))),
    supersededPostTrackCue: superseded,
  });
}

function fourccWord(value) {
  const bytes = Buffer.allocUnsafe(4);
  bytes.write(value, 0, 4, "ascii");
  return bytes.readUInt32LE(0);
}

function verifySceneObjectTransition(bytes, transition) {
  const runtimeTag = pcRelativeLong(bytes, transition.runtimeFlagCall - 12, 5);
  if (
    bytes.readUInt16LE(transition.runtimeFlagCall) !== 0x400b
    || bytes.readUInt16LE(transition.runtimeFlagCall - 14) !== 0xe401
    || bytes.readUInt16LE(transition.runtimeFlagCall - 10) !== 0x2d46
    || bytes.readUInt16LE(transition.runtimeFlagCall - 8) !== 0x2d56
    || bytes.readUInt16LE(transition.runtimeFlagCall - 6) !== 0xe51f
    || runtimeTag.value !== fourccWord(transition.actorTag)
  ) {
    throw new Error(`OP00 ${transition.actorTag} runtime-state call changed`);
  }
  const presentationTag = pcRelativeLong(
    bytes,
    transition.presentationFlagCall - 12,
    5,
  );
  const presentationOperation = pcRelativeLong(
    bytes,
    transition.presentationFlagCall - 6,
    5,
  );
  if (
    bytes.readUInt16LE(transition.presentationFlagCall) !== 0x400b
    || bytes.readUInt16LE(transition.presentationFlagCall - 14) !== 0xe401
    || bytes.readUInt16LE(transition.presentationFlagCall - 10) !== 0x2d46
    || bytes.readUInt16LE(transition.presentationFlagCall - 8) !== 0x2d56
    || presentationTag.value !== fourccWord(transition.actorTag)
    || presentationOperation.value !== 0x00a8
  ) {
    throw new Error(`OP00 ${transition.actorTag} presentation-state call changed`);
  }
  return {
    actorTag: transition.actorTag,
    presented: transition.presented,
    runtimeFlag: {
      operation: "0x001f",
      mode: 1,
      callFileOffset: offsetHex(transition.runtimeFlagCall),
      tagLiteralOffset: offsetHex(runtimeTag.literalOffset),
    },
    presentationFlag: {
      operation: "0x00a8",
      mode: 1,
      callFileOffset: offsetHex(transition.presentationFlagCall),
      tagLiteralOffset: offsetHex(presentationTag.literalOffset),
      operationLiteralOffset: offsetHex(presentationOperation.literalOffset),
    },
  };
}

function recoverOpeningSceneObjectTimeline(bytes) {
  const persistentActorTags = [...new Set(
    OPENING_SCENE_OBJECT_TRANSITIONS.map(value => value.actorTag),
  )].sort();
  const current = new Map(persistentActorTags.map(actorTag => [actorTag, false]));
  const result = new Array(OPENING_TRACK_COUNT);
  const nativeSetups = openingNativeActivitySetups();
  for (const [activityIndex, setup] of nativeSetups.entries()) {
    const { trackIndex } = setup;
    const previousSetup = nativeSetups[activityIndex - 1];
    const transitions = OPENING_SCENE_OBJECT_TRANSITIONS.filter(
      value => value.beforeTrackIndex === trackIndex,
    );
    const writes = transitions.map((transition) => {
      if (
        transition.presentationFlagCall >= setup.activityCall
        || transition.runtimeFlagCall >= setup.activityCall
        || (previousSetup && (
          transition.presentationFlagCall <= previousSetup.activityCall
          || transition.runtimeFlagCall <= previousSetup.activityCall
        ))
      ) {
        throw new Error(`OP00 ${transition.actorTag} state write is outside its track boundary`);
      }
      const write = verifySceneObjectTransition(bytes, transition);
      current.set(transition.actorTag, transition.presented);
      return write;
    });
    result[trackIndex] = {
      writes,
      effectiveStates: persistentActorTags.map(actorTag => ({
        actorTag,
        presented: current.get(actorTag),
      })),
      source: {
        runtimeOperation: "0x001f",
        presentationOperation: "0x00a8",
        beforeActivityCallFileOffset: offsetHex(setup.activityCall),
      },
    };
  }
  if (result.some(value => !value)) {
    throw new Error("OP00 scene-object state timeline is incomplete");
  }
  return result;
}

function recoverOpeningMapLayerTimeline(bytes) {
  const scn3Offset = bytes.indexOf(Buffer.from("SCN3"));
  if (scn3Offset !== 8) throw new Error("OP00 SCN3 offset changed");
  const current = new Map();
  const playbackSetups = openingNativeActivitySetups();

  const recovered = playbackSetups.map((setup, playbackIndex) => {
    const activityCall = setup.activityCall;
    if (
      bytes.readUInt16LE(activityCall) !== 0x400b
      || bytes.readUInt16LE(activityCall - 10) !== (0xe400 | setup.trackIndex)
      || bytes.readUInt16LE(activityCall - 8) !== 0x2d46
      || bytes.readUInt16LE(activityCall - 6) !== 0xe550
    ) {
      throw new Error(`OP00 track ${setup.trackIndex} activity call changed`);
    }

    if (Number.isInteger(setup.launchCall)) {
      const target = pcRelativeLong(bytes, setup.launchCall - 18, 1);
      if (
        bytes.readUInt16LE(setup.launchCall) !== 0x400b
        || bytes.readUInt16LE(setup.launchCall - 6) !== 0xe502
        || target.value + scn3Offset !== setup.functionOffset
      ) {
        throw new Error(`OP00 track ${setup.trackIndex} map-layer launch changed`);
      }
    } else if (
      setup.inheritedFromTrackIndex
        !== playbackSetups[playbackIndex - 1]?.trackIndex
    ) {
      throw new Error(`OP00 track ${setup.trackIndex} has invalid inherited map state`);
    }

    const writes = setup.writes.map(([layer, value, callFileOffset]) => {
      const operation = pcRelativeLong(bytes, callFileOffset - 6, 5);
      if (
        bytes.readUInt16LE(callFileOffset) !== 0x400b
        || bytes.readUInt16LE(callFileOffset - 14) !== (0xe400 | value)
        || bytes.readUInt16LE(callFileOffset - 12) !== (0xe500 | layer)
        || bytes.readUInt16LE(callFileOffset - 10) !== 0x2d46
        || bytes.readUInt16LE(callFileOffset - 8) !== 0x2d56
        || operation.value !== 0x0098
      ) {
        throw new Error(
          `OP00 track ${setup.trackIndex} map-layer call ${offsetHex(callFileOffset)} changed`,
        );
      }
      current.set(layer, value);
      return {
        layer,
        value,
        callFileOffset: offsetHex(callFileOffset),
        operationLiteralOffset: offsetHex(operation.literalOffset),
      };
    });
    const effectiveStates = [...current].sort(
      ([left], [right]) => left - right,
    ).map(([layer, value]) => ({ layer, value }));
    if (
      effectiveStates.length !== 5
      || effectiveStates.some((state, layer) => state.layer !== layer)
    ) {
      throw new Error(
        `OP00 track ${setup.trackIndex} has incomplete script-controlled map state`,
      );
    }
    return {
      trackIndex: setup.trackIndex,
      writes,
      effectiveStates,
      source: {
        operation: "0x0098",
        activityCallFileOffset: offsetHex(activityCall),
        ...(Number.isInteger(setup.launchCall)
          ? {
              setupLaunchCallFileOffset: offsetHex(setup.launchCall),
              setupFunctionFileOffset: offsetHex(setup.functionOffset),
            }
          : { inheritedFromTrackIndex: setup.inheritedFromTrackIndex }),
      },
    };
  });
  return recovered.sort((left, right) => left.trackIndex - right.trackIndex);
}

function parseAfs(bytes) {
  if (!ascii(bytes, 0, 4).startsWith("AFS")) {
    throw new Error("OP99.AFS has no AFS header");
  }
  const count = bytes.readUInt32LE(4);
  if (count > 1000 || 8 + count * 8 > bytes.length) {
    throw new Error("OP99.AFS has an invalid entry table");
  }
  return Array.from({ length: count }, (_, index) => {
    const offset = bytes.readUInt32LE(8 + index * 8);
    const byteLength = bytes.readUInt32LE(12 + index * 8);
    if (offset > bytes.length || byteLength > bytes.length - offset) {
      throw new Error(`OP99.AFS entry ${index} exceeds the archive`);
    }
    return { index, offset, byteLength };
  });
}

function parseIpacChildren(entryBytes, base) {
  if (ascii(entryBytes, base, base + 4) !== "IPAC") return [];
  const table = base + entryBytes.readUInt32LE(base + 4);
  const count = entryBytes.readUInt32LE(base + 8);
  if (count > 1000 || table + count * 20 > entryBytes.length) {
    throw new Error("OP99 IPAC has an invalid child table");
  }
  return Array.from({ length: count }, (_, index) => {
    const record = table + index * 20;
    const filename = cleanAscii(entryBytes, record, record + 8);
    const extension = cleanAscii(entryBytes, record + 8, record + 12);
    const offset = base + entryBytes.readUInt32LE(record + 12);
    const byteLength = entryBytes.readUInt32LE(record + 16);
    if (offset > entryBytes.length || byteLength > entryBytes.length - offset) {
      throw new Error(`OP99 IPAC child ${filename}.${extension} exceeds its entry`);
    }
    return { index, filename, extension, offset, byteLength };
  });
}

function parsePackage(entryBytes) {
  const magic = ascii(entryBytes, 0, 4);
  if (magic === "PAKS") {
    return {
      magic,
      family: entryBytes.readUInt32LE(8),
      children: parseIpacChildren(entryBytes, 16),
    };
  }
  if (magic === "PAKF") {
    const packageSize = entryBytes.readUInt32LE(4);
    return {
      magic,
      family: entryBytes.readUInt32LE(8),
      children: parseIpacChildren(entryBytes, packageSize),
    };
  }
  return { magic, family: null, children: [] };
}

function collectFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path.resolve(filename) !== path.resolve(outputDirectory)) {
        collectFiles(filename, files);
      }
    } else if (entry.isFile()) {
      files.push(filename);
    }
  }
  return files;
}

function canonicalAssetsByHash() {
  const roots = [path.join(repoRoot, "play/assets"), path.join(repoRoot, "public/models")];
  const index = new Map();
  for (const filename of roots.flatMap(root => collectFiles(root))) {
    const extension = path.extname(filename).slice(1).toUpperCase();
    if (!MODEL_EXTENSIONS.has(extension)) continue;
    const hash = sha256(readFileSync(filename));
    const candidates = index.get(hash) || [];
    candidates.push(relative(filename));
    index.set(hash, candidates);
  }
  for (const candidates of index.values()) candidates.sort();
  return index;
}

function writeReproducibleAsset(filename, bytes) {
  if (existsSync(filename)) {
    if (!readFileSync(filename).equals(bytes)) {
      throw new Error(`refusing to replace nonmatching asset ${relative(filename)}`);
    }
    return false;
  }
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, bytes);
  return true;
}

function sourceWord(mapinfoBytes, source) {
  if (Number.isInteger(source.literalOffset)) {
    return mapinfoBytes.readUInt32LE(source.literalOffset);
  }
  if (source.value === 0 && Number.isInteger(source.instructionOffset)) {
    // The exact SH-4 instruction writes an immediate zero into the local
    // vector. Preserve the instruction offset even though no literal exists.
    const instruction = mapinfoBytes.readUInt16LE(source.instructionOffset);
    if ((instruction & 0xff00) !== 0xe500) {
      throw new Error(
        `OP00 attachment zero source at 0x${source.instructionOffset.toString(16)} changed`,
      );
    }
    return 0;
  }
  throw new Error("OP00 attachment vector source is unsupported");
}

function recoverFixoAttachment(mapinfoBytes, actorTag, definition) {
  if (mapinfoBytes.readUInt16LE(definition.callFileOffset) !== 0x400b) {
    throw new Error(
      `OP00 ${actorTag} FIXO call at 0x${definition.callFileOffset.toString(16)} changed`,
    );
  }
  if (mapinfoBytes.readUInt32LE(definition.operationLiteralOffset) !== 0x00e6) {
    throw new Error(`OP00 ${actorTag} attachment operation changed`);
  }
  if (
    ascii(mapinfoBytes, definition.actorLiteralOffset, definition.actorLiteralOffset + 4)
      !== actorTag
    || ascii(
      mapinfoBytes,
      definition.parentLiteralOffset,
      definition.parentLiteralOffset + 4,
    ) !== definition.parentActorTag
  ) {
    throw new Error(`OP00 ${actorTag} attachment actor binding changed`);
  }
  if (
    mapinfoBytes.readUInt16LE(definition.controlInstructionOffset)
      !== (0xe600 | definition.controlId)
  ) {
    throw new Error(`OP00 ${actorTag} attachment control changed`);
  }
  const ownership = deriveNativeAseqCallOwnership({
    bytes: mapinfoBytes,
    trackFunctions: OPENING_TRACK_MAP_LAYER_SETUPS,
    callFileOffset: definition.callFileOffset,
  });
  const translationWords = definition.translationSources.map(
    source => sourceWord(mapinfoBytes, source),
  );
  const rotationRaw = definition.rotationSources.map(
    source => sourceWord(mapinfoBytes, source),
  );
  if (rotationRaw.some(value => value > 0xffff)) {
    throw new Error(`OP00 ${actorTag} FIXO rotation is not a fixed-turn word`);
  }
  return {
    activitySlot: ownership.trackIndex,
    frame: ownership.frame,
    parentActorTag: definition.parentActorTag,
    controlId: definition.controlId,
    translation: translationWords.map(word => {
      const value = Buffer.allocUnsafe(4);
      value.writeUInt32LE(word);
      return value.readFloatLE(0);
    }),
    rotationRaw,
    source: {
      operation: "0x00e6",
      governingFrame: ownership.frame,
      setupFunctionFileOffset: `0x${ownership.functionOffset.toString(16)}`,
      setupFunctionEndFileOffset: `0x${ownership.functionEndOffset.toString(16)}`,
      callFileOffset: `0x${definition.callFileOffset.toString(16)}`,
      operationLiteralOffset: `0x${definition.operationLiteralOffset.toString(16)}`,
      actorLiteralOffset: `0x${definition.actorLiteralOffset.toString(16)}`,
      parentLiteralOffset: `0x${definition.parentLiteralOffset.toString(16)}`,
      controlInstructionOffset: `0x${definition.controlInstructionOffset.toString(16)}`,
      translationSources: definition.translationSources.map(source => ({
        ...(Number.isInteger(source.literalOffset)
          ? { literalOffset: `0x${source.literalOffset.toString(16)}` }
          : {
              immediateValue: source.value,
              instructionOffset: `0x${source.instructionOffset.toString(16)}`,
            }),
      })),
      rotationSources: definition.rotationSources.map(source => ({
        ...(Number.isInteger(source.literalOffset)
          ? { literalOffset: `0x${source.literalOffset.toString(16)}` }
          : {
              immediateValue: source.value,
              instructionOffset: `0x${source.instructionOffset.toString(16)}`,
            }),
      })),
    },
  };
}

function scanOpeningTracks(mapinfo) {
  const tracks = [];
  let offset = OPENING_FIRST_TRACK_OFFSET;
  while (tracks.length < OPENING_TRACK_COUNT) {
    if (ascii(mapinfo, offset, offset + 4) !== "TRCK") {
      offset += 4;
      if (offset >= EXPECTED_OPENING_END_OFFSET) {
        throw new Error(`OP00 opening track ${tracks.length} has no TRCK header`);
      }
      continue;
    }
    const byteLength = mapinfo.readUInt32LE(offset + 4);
    const bytes = mapinfo.subarray(offset, offset + byteLength);
    parseAuthTrack(bytes);
    tracks.push({ index: tracks.length, sourceOffset: offset, byteLength, bytes });
    offset += byteLength;
  }
  if (offset > EXPECTED_OPENING_END_OFFSET) {
    throw new Error(`OP00 A0114 tracks end at unexpected offset 0x${offset.toString(16)}`);
  }
  return tracks;
}

function firstOpeningActorPose(tracks, actorTag) {
  for (const { trackIndex } of openingNativeActivitySetups()) {
    const track = tracks[trackIndex];
    const movement = parseAuthMovement(track.bytes);
    const actor = movement.actors.find(value => value.tag === actorTag);
    if (!actor) continue;
    const pose = evaluateAuthActor(actor, 0);
    return {
      position: [pose.x, pose.y, pose.z],
      rotationDegrees: [pose.rotationX, pose.rotationY, pose.rotationZ],
      scale: [1, 1, 1],
      source: {
        kind: "first-auth-pose",
        trackIndex,
        sourceMapinfoOffset: track.sourceOffset,
        movementIndex: actor.index,
        timeSeconds: 0,
      },
    };
  }
  return null;
}

function samePose(left, right) {
  return [
    ...left.position.map((value, index) => value - right.position[index]),
    ...left.rotationDegrees.map(
      (value, index) => value - right.rotationDegrees[index],
    ),
  ].every(value => Math.abs(value) < 1e-3);
}

const mapinfo = readPinnedSource("MAPINFO.BIN");
const op99 = readPinnedSource("OP99.AFS");
const motionBank = readPinnedSource("M_0101A.BIN");
const nativeTalkPoseBytes = readFileSync(nativeTalkPosePath);
const nativeTalkPoses = JSON.parse(nativeTalkPoseBytes.toString("utf8"));
if (
  nativeTalkPoses.schema !== "new-yokosuka-native-talk-control-poses-v2"
  || nativeTalkPoses.controlCount !== 25
  || nativeTalkPoses.channelsPerControl !== 3
  || nativeTalkPoses.poseDuration !== 79
) {
  throw new Error("OP00 native TALK pose asset is invalid");
}
const nativeTalkPoseRecord = Object.freeze({
  path: relative(nativeTalkPosePath),
  byteLength: nativeTalkPoseBytes.length,
  sha256: sha256(nativeTalkPoseBytes),
  generatedBy: "tools/animation/extract_native_face_poses.py",
});
const sourceFiles = Object.fromEntries(Object.entries(SOURCE_EXPECTATIONS).map(
  ([filename, record]) => [filename, {
    path: `extracted_files/data/SCENE/01/OP00/${filename}`,
    ...record,
  }],
));

const openingTracks = scanOpeningTracks(mapinfo);
const openingMapLayerTimeline = recoverOpeningMapLayerTimeline(mapinfo);
const openingSceneObjectTimeline = recoverOpeningSceneObjectTimeline(mapinfo);
const openingHandPoseTimeline = recoverOpeningHandPoseTimeline(mapinfo);
const openingBodyHandPoseTimeline = recoverOpeningBodyHandPoseTimeline(mapinfo);
const openingFaceClipTimeline = recoverOpeningFaceClipTimeline(mapinfo);
const openingFaceGazeTimeline = recoverOpeningFaceGazeTimeline(mapinfo);
const motionBankPath = path.join(outputDirectory, "M_0101A.BIN");
let writtenFileCount = 0;
const activityAssets = openingTracks.map((track) => {
  const archiveMember = `SEQDATA${track.index}.AUTH`;
  const outputPath = path.join(outputDirectory, archiveMember);
  if (writeReproducibleAsset(outputPath, track.bytes)) writtenFileCount += 1;
  return Object.freeze({
    slot: track.index,
    archiveMember,
    activityId: `OP00/${archiveMember}`,
    path: relative(outputPath),
    byteLength: track.byteLength,
    sha256: sha256(track.bytes),
  });
});
if (writeReproducibleAsset(motionBankPath, motionBank)) writtenFileCount += 1;
const facialAssets = Object.fromEntries(Object.entries(
  REQUIRED_FACIAL_ASSETS,
).map(([actorTag, definition]) => {
  const modelFilename = `${definition.faceCode}_F.MT5`;
  const tableFilename = `${definition.faceCode}_FTBL.BIN`;
  const modelBytes = readPinnedFaceSource(modelFilename);
  const tableBytes = readPinnedFaceSource(tableFilename);
  const poseActor = nativeTalkPoses.actors?.[actorTag];
  if (
    poseActor?.faceCode !== definition.faceCode
    || poseActor?.tableSha256 !== FACE_SOURCE_EXPECTATIONS[tableFilename].sha256
    || poseActor?.upperPoses?.length !== nativeTalkPoses.poseDuration + 1
    || poseActor?.mouthPoses?.length !== nativeTalkPoses.poseDuration + 1
  ) {
    throw new Error(`OP00 native TALK poses do not match ${actorTag}`);
  }
  const modelOutputPath = path.join(faceOutputDirectory, modelFilename);
  const tableOutputPath = path.join(faceOutputDirectory, tableFilename);
  if (writeReproducibleAsset(modelOutputPath, modelBytes)) writtenFileCount += 1;
  if (writeReproducibleAsset(tableOutputPath, tableBytes)) writtenFileCount += 1;
  return [actorTag, {
    actorTag,
    bodyModelCode: definition.bodyModelCode,
    faceCode: definition.faceCode,
    attachmentRenderKey: -0x43,
    faceRootRenderKey: 3,
    eyeRenderKeys: [77, 78],
    model: {
      path: relative(modelOutputPath),
      sourcePath: `extracted_files/data/SCENE/01/MODEL/FACE/${modelFilename}`,
      ...FACE_SOURCE_EXPECTATIONS[modelFilename],
    },
    table: {
      path: relative(tableOutputPath),
      sourcePath: `extracted_files/data/SCENE/01/MODEL/FACE/${tableFilename}`,
      ...FACE_SOURCE_EXPECTATIONS[tableFilename],
    },
    poses: {
      ...nativeTalkPoseRecord,
      actorTag,
    },
  }];
}));
const handAssets = Object.fromEntries(Object.entries(
  REQUIRED_HAND_ASSETS,
).map(([actorTag, definition]) => {
  const rigFilename = `${definition.handCode}_HM.BIN`;
  const leftFilename = `${definition.handCode}_TL.MT5`;
  const rightFilename = `${definition.handCode}_TR.MT5`;
  const rigBytes = readPinnedHandSource(rigFilename);
  const leftBytes = readPinnedHandSource(leftFilename);
  const rightBytes = readPinnedHandSource(rightFilename);
  const rigLayout = validateHandRig(rigBytes, rigFilename);
  const rigOutputPath = path.join(handOutputDirectory, rigFilename);
  const leftOutputPath = path.join(handOutputDirectory, leftFilename);
  const rightOutputPath = path.join(handOutputDirectory, rightFilename);
  for (const [outputPath, bytes] of [
    [rigOutputPath, rigBytes],
    [leftOutputPath, leftBytes],
    [rightOutputPath, rightBytes],
  ]) {
    if (writeReproducibleAsset(outputPath, bytes)) writtenFileCount += 1;
  }
  const record = (outputPath, filename) => ({
    path: relative(outputPath),
    sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${filename}`,
    ...HAND_SOURCE_EXPECTATIONS[filename],
  });
  return [actorTag, {
    actorTag,
    bodyModelCode: definition.bodyModelCode,
    handCode: definition.handCode,
    bodyHandRenderKeys: { left: -0x42, right: -0x41 },
    left: {
      rootRenderKey: definition.leftRootRenderKey,
      model: record(leftOutputPath, leftFilename),
    },
    right: {
      rootRenderKey: definition.rightRootRenderKey,
      model: record(rightOutputPath, rightFilename),
    },
    rig: {
      ...record(rigOutputPath, rigFilename),
      ...rigLayout,
    },
    presentation: {
      attachment: "body-hand-node-world-matrix",
      initialPose: "hm-bind-pose",
      deformationAssetRetained: true,
      nativePoseOperation: "0x005e",
    },
  }];
}));

const requiredMotionIndices = [...new Set(openingTracks.flatMap(track => (
  parseAuthSequence(track.bytes).motions.map(motion => motion.sequenceIndex)
)))].filter(Number.isInteger).sort((left, right) => left - right);
const motionPackage = MotnLoader.parse(motionBank, {
  sequenceIndices: requiredMotionIndices,
});

const actorTags = new Set();
let totalMotionCount = 0;
const timelineTracks = openingTracks.map(track => {
  const sequence = parseAuthSequence(track.bytes);
  const movement = parseAuthMovement(track.bytes);
  const camera = parseAuthCamera(track.bytes);
  const strings = parseAuthStrings(track.bytes);
  const mapLayerState = openingMapLayerTimeline[track.index];
  const sceneObjectState = openingSceneObjectTimeline[track.index];
  const handPoseCues = openingHandPoseTimeline.cues[track.index];
  const bodyHandPoseCues = openingBodyHandPoseTimeline.cues[track.index];
  const faceClipCues = openingFaceClipTimeline[track.index];
  const faceGazeCues = openingFaceGazeTimeline[track.index];
  if (mapLayerState?.trackIndex !== track.index) {
    throw new Error(`OP00 opening track ${track.index} has no native map-layer state`);
  }
  if (!sceneObjectState) {
    throw new Error(`OP00 opening track ${track.index} has no scene-object state`);
  }
  const motions = resolveAuthMotions(sequence, motionPackage);
  const commandCounts = {};
  for (const frame of sequence.frames) {
    for (const command of frame.commands) {
      commandCounts[command.name] = (commandCounts[command.name] || 0) + 1;
    }
  }
  sequence.actors.filter(Boolean).forEach(tag => actorTags.add(tag));
  totalMotionCount += motions.length;
  if (
    movement.actors.length !== sequence.actors.length
    || camera.cameras.length !== 1
    || motions.some(motion => motion.motionValid !== true)
  ) {
    throw new Error(`OP00 opening track ${track.index} failed structural validation`);
  }
  const asset = activityAssets[track.index];
  const record = {
    index: track.index,
    sourceOffset: track.sourceOffset,
    byteLength: track.byteLength,
    sha256: sha256(track.bytes),
    slot: track.index,
    binding: { kind: "map-embedded-slot" },
    activityId: asset.activityId,
    archiveMember: asset.archiveMember,
    durationFrames: sequence.durationFrames,
    durationSeconds: sequence.durationFrames / 30,
    authoredChannelDurationSeconds: Math.max(movement.duration, camera.duration),
    frameCount: sequence.frames.length,
    actors: sequence.actors,
    cameraCount: camera.cameras.length,
    movementCount: movement.actors.length,
    commandCounts,
    nativeMapLayerWrites: mapLayerState.writes,
    nativeMapLayerStates: mapLayerState.effectiveStates,
    nativeMapLayerStateSource: mapLayerState.source,
    browserMapVisibility: OPENING_BROWSER_MAP_VISIBILITY,
    nativeSceneObjectWrites: sceneObjectState.writes,
    nativeSceneObjectStates: sceneObjectState.effectiveStates,
    nativeSceneObjectStateSource: sceneObjectState.source,
    nativeHandPoseCues: handPoseCues,
    nativeBodyHandPoseCues: bodyHandPoseCues,
    nativeFaceClipCues: faceClipCues,
    nativeFaceGazeCues: faceGazeCues,
    motions: motions.map(motion => ({
      actorTag: motion.actorTag,
      frame: motion.frame,
      motionBank: motion.motionBank,
      sequenceIndex: motion.sequenceIndex,
      motionName: motion.motionName,
      startFrame: motion.startFrame,
      endFrame: motion.endFrame,
    })),
    audioStrings: strings.strings,
    asset: {
      path: asset.path,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    },
  };
  return record;
});
const orderedActorTags = [...actorTags].sort();
if (JSON.stringify(orderedActorTags) !== JSON.stringify(EXPECTED_ACTOR_TAGS)) {
  throw new Error("OP00 A0114 actor set changed");
}
if (totalMotionCount !== 148) throw new Error("OP00 A0114 motion count changed");

const canonicalByHash = canonicalAssetsByHash();
const afsEntries = parseAfs(op99);
const archivePackages = afsEntries.map(entry => {
  const bytes = op99.subarray(entry.offset, entry.offset + entry.byteLength);
  return { ...entry, bytes, ...parsePackage(bytes) };
});
const chrtBindings = [];
for (const archivePackage of archivePackages) {
  for (const child of archivePackage.children) {
    if (child.filename !== "CHARA" || child.extension.toUpperCase() !== "CHRT") {
      continue;
    }
    const childBytes = archivePackage.bytes.subarray(
      child.offset,
      child.offset + child.byteLength,
    );
    chrtBindings.push(...parseChrtSceneObjectBindings(childBytes).map(binding => ({
      ...binding,
      archiveEntryIndex: archivePackage.index,
      childIndex: child.index,
    })));
  }
}
const sceneObjectBindings = Object.fromEntries(Object.entries(
  REQUIRED_SCENE_OBJECTS,
).map(([actorTag, expected]) => {
  const matches = chrtBindings.filter(binding => binding.actorTag === actorTag);
  if (
    matches.length !== 1
    || matches[0].image !== expected.image
    || matches[0].model !== expected.model
  ) {
    throw new Error(`OP00 scene object ${actorTag} CHRT binding changed`);
  }
  const binding = matches[0];
  const firstAuthPose = firstOpeningActorPose(openingTracks, actorTag);
  if (!firstAuthPose) throw new Error(`OP00 scene object ${actorTag} has no AUTH pose`);
  if (binding.presentation && !samePose(binding.presentation, firstAuthPose)) {
    throw new Error(`OP00 scene object ${actorTag} CHRT and AUTH poses differ`);
  }
  const persistent = OPENING_SCENE_OBJECT_TRANSITIONS.some(
    value => value.actorTag === actorTag,
  );
  const initialPresentation = binding.presentation ? {
    position: binding.presentation.position,
    rotationDegrees: binding.presentation.rotationDegrees,
    scale: binding.presentation.scale,
    source: {
      kind: "chrt-associated-object",
      archive: "OP99.AFS",
      archiveEntryIndex: binding.archiveEntryIndex,
      childIndex: binding.childIndex,
      ...binding.presentation.source,
    },
  } : firstAuthPose;
  const { presentation: _presentation, ...bindingWithoutPresentation } = binding;
  return [actorTag, {
    ...bindingWithoutPresentation,
    browserFilename: `S1_OP00_${expected.model}.MT5`,
    initialPresentation,
    lifecycle: persistent ? {
      kind: "room-script-persistent",
      stateOperations: ["0x001f", "0x00a8"],
    } : { kind: "auth-scoped" },
  }];
}));
const attachedObjectBindings = Object.fromEntries(Object.entries(
  REQUIRED_ATTACHED_OBJECTS,
).map(([actorTag, expected]) => {
  const matches = chrtBindings.filter(binding => binding.actorTag === actorTag);
  if (
    matches.length !== 1
    || matches[0].image !== expected.image
    || matches[0].model !== expected.model
  ) {
    throw new Error(`OP00 attached object ${actorTag} CHRT binding changed`);
  }
  const { presentation: _presentation, ...binding } = matches[0];
  return [actorTag, {
    ...binding,
    browserFilename: `S1_OP00_${expected.model}.MT5`,
    attachments: expected.attachments.map(
      definition => recoverFixoAttachment(mapinfo, actorTag, definition),
    ),
  }];
}));
const modelAssets = [];
for (const archivePackage of archivePackages) {
  for (const child of archivePackage.children) {
    if (!MODEL_EXTENSIONS.has(child.extension.toUpperCase())) continue;
    const bytes = archivePackage.bytes.subarray(
      child.offset,
      child.offset + child.byteLength,
    );
    const hash = sha256(bytes);
    const requiredEnvironment = REQUIRED_ENVIRONMENT_MODELS.includes(child.filename);
    const requiredCharacter = REQUIRED_CHARACTER_MODELS.includes(child.filename);
    const requiredSceneObject = REQUIRED_SCENE_OBJECT_MODELS.includes(child.filename);
    const requiredAttachedObject = REQUIRED_ATTACHED_OBJECT_MODELS.includes(
      child.filename,
    );
    const canonicalCandidates = canonicalByHash.get(hash) || [];
    let assetPath = canonicalCandidates[0] || null;
    let resolution = assetPath ? "canonical-byte-match" : "unselected-source-asset";
    if (
      (requiredEnvironment || requiredSceneObject || requiredAttachedObject)
      && !assetPath
    ) {
      const outputPath = path.join(
        modelOutputDirectory,
        `${child.filename}.${child.extension}`,
      );
      if (writeReproducibleAsset(outputPath, bytes)) writtenFileCount += 1;
      assetPath = relative(outputPath);
      resolution = "new-required-extraction";
    }
    if (requiredCharacter && !assetPath) {
      throw new Error(`required OP00 character ${child.filename} has no canonical byte match`);
    }
    modelAssets.push({
      nativeName: child.filename,
      extension: child.extension,
      archiveEntryIndex: archivePackage.index,
      childIndex: child.index,
      byteLength: child.byteLength,
      sha256: hash,
      requiredByOpening: requiredEnvironment
        || requiredCharacter
        || requiredSceneObject
        || requiredAttachedObject,
      role: requiredEnvironment
        ? "environment"
        : requiredCharacter
          ? "character"
          : requiredSceneObject
            ? "scene-object"
            : requiredAttachedObject
              ? "attached-object"
              : null,
      resolution,
      assetPath,
      canonicalCandidates,
    });
  }
}

for (const nativeName of [
  ...REQUIRED_ENVIRONMENT_MODELS,
  ...REQUIRED_CHARACTER_MODELS,
  ...REQUIRED_SCENE_OBJECT_MODELS,
  ...REQUIRED_ATTACHED_OBJECT_MODELS,
]) {
  const matches = modelAssets.filter(asset => asset.nativeName === nativeName);
  if (matches.length !== 1 || !matches[0].assetPath) {
    throw new Error(`OP00 required asset ${nativeName} did not resolve exactly once`);
  }
}

const mapLayerPackage = archivePackages.find(value => value.index === 27);
const mapLayerChildren = mapLayerPackage?.children.filter(
  value => value.extension.toUpperCase() === "MAPM",
) || [];
if (
  JSON.stringify(mapLayerChildren.map(value => value.filename))
    !== JSON.stringify(OPENING_LAYERED_PACKAGE_MODELS)
) {
  throw new Error("OP00 entry 27 MAPM child order changed");
}
const mapVisibilityModels = OPENING_BROWSER_MAP_VISIBILITY.map((visibility) => {
  const child = mapLayerChildren.find(value => value.filename === visibility.nativeName);
  const asset = modelAssets.find(value => (
    value.archiveEntryIndex === mapLayerPackage.index
    && value.childIndex === child?.index
    && value.nativeName === visibility.nativeName
  ));
  if (!asset?.assetPath) {
    throw new Error(`OP00 visibility model ${visibility.nativeName} is unavailable`);
  }
  return {
    nativeName: visibility.nativeName,
    browserFilename: `S1_OP00_${visibility.nativeName}.MT5`,
    assetPath: asset.assetPath,
    visible: visibility.visible,
    source: {
      archive: "OP99.AFS",
      archiveEntryIndex: mapLayerPackage.index,
      archiveFamily: mapLayerPackage.family,
      childIndex: child.index,
    },
    evidenceBoundary: (
      "Visual cutaway override for the extracted all-model browser scene. "
      + "It is not asserted to be a numbered native 0x0098 slot binding."
    ),
  };
});

const inventory = {
  schema: "new-yokosuka-op00-asset-inventory-v10",
  generatedBy: "tools/cutscenes/build_op00_introduction_assets.mjs",
  sources: sourceFiles,
  evidenceBoundary: (
    "Every OP99 model child is identified by its exact AFS/IPAC entry and SHA-256. "
    + "Required character assets reuse an existing browser asset only when the bytes "
    + "match exactly. Required environment and CHRT-bound scene-object assets are "
    + "emitted only when no canonical byte match exists. Independent and attached "
    + "object actor/model bindings are decoded from CHARA.CHRT rather than inferred "
    + "from filenames. Persistent objects use the associated Object placement nested "
    + "in their Character record, not the record's inactive parking position. Exact "
    + "room-script operation-0x001f/0x00a8 calls materialize their effective presented "
    + "state before every AUTH track. Attached-object FIXO routes and transforms are "
    + "recovered from the pinned MAPINFO operation-0x00e6 calls. Per-track operation-0x0098 writes "
    + "and effective numbered states come from the pinned room script. Native slots "
    + "are assigned by resource registration order, so OP99 child order is retained "
    + "as archive evidence but is never used as a slot-to-model binding. The OMADO "
    + "browser cutaway is recorded separately as a visual visibility override. "
    + "The existing production S1_OP00 texture pack is referenced, not copied. "
    + "Facial bindings use the exact character FACE model and FTBL pair from "
    + "SCENE/01/MODEL/FACE; exact upper-face and six mouth-pose control deltas "
    + "are generated by the original SH-4 TALK evaluator and retained as one "
    + "versioned metadata asset. These are separate animated presentation "
    + "resources, not duplicates of the canonical body CHRM."
    + " Detailed hand presentation uses each actor's exact T-left/T-right "
    + "resources from SCENE/01/MODEL/HAND. Detailed-hand ownership begins at "
    + "each resource's authored proximal attachment boundary: distal polygons "
    + "from the body's native -66/-65 hand subtree are replaced while the "
    + "body-side wrist ring remains. The matching HM.BIN 71-node/306-vertex deformation "
    + "resource is retained with the selection; OP99 packages are not treated "
    + "as evidence that their incidental hand variant belongs to A0114. "
    + "The low-detail body hand remains active until an exact operation-0x005e "
    + "cue requests detailed ownership. All effective operation-0x0081 MHND "
    + "requests are extracted beside their AUTH tracks and replay the original "
    + "ten-word body-hand rotations with native signed timing."
  ),
  texturePack: {
    asset: "S1_OP00_textures.bin",
    url: "/models/S1_OP00_textures.bin",
    byteLength: 4526352,
    sha256: "3a09484a0049de0547eb1e5428e5e3ef245e29a1b0c9bf9f816f14ce19285afe",
    resolution: "existing-production-asset",
  },
  sceneObjects: sceneObjectBindings,
  attachedObjects: attachedObjectBindings,
  facialAssets,
  handAssets,
  mapVisibilityModels,
  assets: modelAssets,
  summary: {
    archiveModelCount: modelAssets.length,
    requiredEnvironmentCount: REQUIRED_ENVIRONMENT_MODELS.length,
    mapVisibilityModelCount: mapVisibilityModels.length,
    requiredSceneObjectCount: REQUIRED_SCENE_OBJECT_MODELS.length,
    persistentSceneObjectCount: Object.values(sceneObjectBindings).filter(
      binding => binding.lifecycle.kind === "room-script-persistent",
    ).length,
    requiredAttachedObjectCount: REQUIRED_ATTACHED_OBJECT_MODELS.length,
    requiredFacialAssetCount: Object.keys(facialAssets).length,
    requiredHandAssetCount: Object.keys(handAssets).length,
    reusedCharacterCount: REQUIRED_CHARACTER_MODELS.length,
    newlyExtractedEnvironmentCount: modelAssets.filter(
      asset => asset.role === "environment"
        && asset.resolution === "new-required-extraction",
    ).length,
    newlyExtractedSceneObjectCount: modelAssets.filter(
      asset => asset.role === "scene-object"
        && asset.resolution === "new-required-extraction",
    ).length,
    newlyExtractedAttachedObjectCount: modelAssets.filter(
      asset => asset.role === "attached-object"
        && asset.resolution === "new-required-extraction",
    ).length,
    emittedBinaryCount: (
      REQUIRED_ENVIRONMENT_MODELS.length
      + REQUIRED_SCENE_OBJECT_MODELS.length
      + REQUIRED_ATTACHED_OBJECT_MODELS.length
      + Object.keys(facialAssets).length * 2
      + Object.keys(handAssets).length * 3
      + activityAssets.length
      + 1
    ),
  },
};

const activityManifest = {
  schema: "new-yokosuka-aseq-activity-pack-v1",
  generatedBy: "tools/cutscenes/build_op00_introduction_assets.mjs",
  source: {
    disc: 1,
    ...sourceFiles["MAPINFO.BIN"],
    archiveFormat: "MAPINFO embedded TRCK",
  },
  nativeBinding: {
    evidence: "play/assets/introduction/op00/cutscene-program.generated.json",
    resourceName: "A0114",
    variant: "OP00 introduction",
    selectionRule: (
      "24 exact map-embedded TRCK resources in MAPINFO 0x22ae4..0x481f4; "
      + "compiled owner S1-OP00-A0114 is the sole sequencing authority"
    ),
  },
  audioManifest: "public/audio/world/op00/manifest.json",
  frameRate: 30,
  motionBanks: [{
    bank: 25,
    path: relative(motionBankPath),
    byteLength: motionBank.length,
    sha256: sha256(motionBank),
    source: sourceFiles["M_0101A.BIN"],
  }],
  outputs: [
    {
      path: relative(motionBankPath),
      byteLength: motionBank.length,
      sha256: sha256(motionBank),
    },
    ...activityAssets.map(asset => ({
      path: asset.path,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    })),
  ],
  actorTags: orderedActorTags,
  nativeHandPoseTables: openingHandPoseTimeline.tables,
  nativeBodyHandPoseSource: {
    operation: "0x0081",
    targetTable: "1ST_READ.BIN FUN_0c0d9214 / DAT_0c0d92b4",
    renderRoutes: "1ST_READ.BIN FUN_0c0d8f30 / FUN_0c0d9044",
    supersededPostTrackCue: openingBodyHandPoseTimeline.supersededPostTrackCue,
  },
  nativeFaceClipSource: {
    operation: "0x0113",
    clipBaseRule: "clipGroup * 6",
    upperSelectors: [0, 1],
    selectorRange: [0, 6],
  },
  nativeFaceGazeSource: {
    operation: "0x0099",
    modes: {
      neutral: 0,
      worldTarget: 2,
    },
    angleLimits: "*_FTBL.BIN header +0x0c..+0x23",
    interpolation: "1ST_READ.BIN FUN_0c0bc824 / FUN_0c0bcaec",
  },
  nativeHandPoseSlotOrder: [
    31, 30, 29, 35, 34, 33, 32, 39, 38, 37, 36,
    43, 42, 41, 40, 47, 46, 45, 44,
  ],
  activities: timelineTracks,
  summary: {
    trackCount: timelineTracks.length,
    durationSeconds: timelineTracks.reduce(
      (total, track) => total + track.durationSeconds,
      0,
    ),
    motionCount: totalMotionCount,
    resolvedMotionCount: timelineTracks.reduce(
      (total, track) => total + track.motions.filter(motion => motion.motionName).length,
      0,
    ),
    handPoseTableCount: Object.keys(openingHandPoseTimeline.tables).length,
    handPoseCueCount: timelineTracks.reduce(
      (total, track) => total + track.nativeHandPoseCues.length,
      0,
    ),
    bodyHandPoseCueCount: timelineTracks.reduce(
      (total, track) => total + track.nativeBodyHandPoseCues.length,
      0,
    ),
    faceClipCueCount: timelineTracks.reduce(
      (total, track) => total + track.nativeFaceClipCues.length,
      0,
    ),
    faceGazeCueCount: timelineTracks.reduce(
      (total, track) => total + track.nativeFaceGazeCues.length,
      0,
    ),
  },
};

mkdirSync(path.dirname(inventoryPath), { recursive: true });
mkdirSync(path.dirname(activityManifestPath), { recursive: true });
writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
writeFileSync(activityManifestPath, `${JSON.stringify(activityManifest, null, 2)}\n`);

console.log(
  `Resolved ${REQUIRED_CHARACTER_MODELS.length} OP00 characters by exact-byte reuse; `
  + `wrote ${inventory.summary.newlyExtractedEnvironmentCount} environment and `
  + `${inventory.summary.newlyExtractedSceneObjectCount} scene-object and `
  + `${inventory.summary.newlyExtractedAttachedObjectCount} attached-object models, `
  + `${activityManifest.summary.trackCount} AUTH activities, and motion bank 25 `
  + `(${writtenFileCount} files newly created).`,
);
