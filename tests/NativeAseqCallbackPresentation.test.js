import assert from "node:assert/strict";
import test from "node:test";

import {
  extractNativeAseqCallbackPresentation,
} from "../tools/lib/NativeAseqCallbackPresentation.mjs";

test("native callback presentation rejects a hand pose without static vectors", () => {
  const bytes = Buffer.alloc(0x100);
  bytes.writeUInt16LE(0x2de6, 0);
  bytes.writeUInt16LE(0x4d22, 2);
  bytes.writeUInt16LE(0x7de0, 4);
  bytes.writeUInt16LE(0x6ed3, 6);
  bytes.writeUInt16LE(0x54e0, 8);
  bytes.writeUInt16LE(0xe501, 10);
  bytes.writeUInt16LE(0x3450, 12);
  bytes.writeUInt16LE(0x344a, 14);
  bytes.writeUInt16LE(0x6043, 16);
  bytes.writeUInt16LE(0x8800, 18);
  bytes.writeUInt16LE(0x8b02, 20);
  bytes.writeUInt16LE(0xd10f, 22);
  bytes.writeUInt16LE(0x0123, 24);
  bytes.writeUInt32LE(0x40 - 28, 0x54);
  assert.throws(
    () => extractNativeAseqCallbackPresentation({
      bytes,
      callbackFunction: 0,
      durationFrames: 10,
      nativeFunction: {
        blocks: [{
          actions: [{
            kind: "engineOperation",
            semanticId: "resolved-object-hndl-hndr-vector-install",
            callFileOffset: "0x28",
            arguments: [
              { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
              { kind: "constant", value: 0 },
              { kind: "constant", value: 0 },
              { kind: "constant", value: 1 },
            ],
          }],
        }],
      },
    }),
    /no exact static HAND pose table/,
  );
});

test("native callback presentation extracts exact FACE controller setup cues", () => {
  const bytes = Buffer.alloc(0x100);
  bytes.writeUInt16LE(0x2de6, 0);
  bytes.writeUInt16LE(0x4d22, 2);
  bytes.writeUInt16LE(0x7de0, 4);
  bytes.writeUInt16LE(0x6ed3, 6);
  bytes.writeUInt16LE(0x54e3, 8);
  bytes.writeUInt16LE(0xe505, 10);
  bytes.writeUInt16LE(0x3450, 12);
  bytes.writeUInt16LE(0x344a, 14);
  bytes.writeUInt16LE(0x6043, 16);
  bytes.writeUInt16LE(0x8800, 18);
  bytes.writeUInt16LE(0x8b02, 20);
  bytes.writeUInt16LE(0xd10f, 22);
  bytes.writeUInt16LE(0x0123, 24);
  bytes.writeUInt32LE(0x40 - 28, 0x54);
  const presentation = extractNativeAseqCallbackPresentation({
    bytes,
    callbackFunction: 0,
    durationFrames: 10,
    nativeFunction: {
      blocks: [{
        actions: [{
          kind: "engineOperation",
          semanticId: "resolved-face-controller-setup",
          callFileOffset: "0x28",
          arguments: [
            { kind: "constant", value: 0x554b5546, ascii: "FUKU" },
            { kind: "constant", value: 1 },
            { kind: "constant", value: 2 },
            { kind: "constant", value: 0 },
          ],
        }],
      }],
    },
  });
  assert.deepEqual(presentation.nativeFaceControllerCues, [{
    activitySlot: 0,
    frame: 5,
    actorTag: "FUKU",
    mode: 1,
    intervalNativeTicks: 2,
    parameter: 0,
    callFileOffset: "0x28",
  }]);
});
