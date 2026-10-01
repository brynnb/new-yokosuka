import assert from "node:assert/strict";
import test from "node:test";

import {
  extractNativeAseqCallbackPresentation,
  extractNativeHandPoseOperation,
} from "../tools/lib/NativeAseqCallbackPresentation.mjs";

test("zero-duration HAND commands keep their authored frame and vectors", () => {
  const bytes = Buffer.alloc(19 * 12);
  bytes.writeInt32LE(-7827, 8);
  const result = extractNativeHandPoseOperation({
    bytes, frame: 121, activitySlot: 2,
    operation: {
      callFileOffset: "0x28",
      arguments: [
        { kind: "constant", ascii: "FUKU" },
        { kind: "constant", value: 1 },
        { kind: "static-pointer", value: 0 },
        { kind: "constant", value: 0 },
      ],
    },
  });
  assert.equal(result.cue.frame, 121);
  assert.equal(result.cue.durationNativeTicks, 1);
  assert.deepEqual(result.table.vectors[0], [0, 0, -7827]);
});

test("the combined presentation extractor does not discard body-hand commands", () => {
  const presentation = extractNativeAseqCallbackPresentation({ bytes: Buffer.alloc(64), callbackFunction: 0,
    durationFrames: 30, nativeFunction: { id: "0x0", entryBlock: "0x0", blocks: [{ id: "0x0", successors: [],
      actions: [{ kind: "engineOperation", semanticId: "actor-mhnd-controller-request", callFileOffset: "0x10",
        arguments: [{ kind: "constant", ascii: "INE_" }, ...[2, 8, 16].map(value => ({ kind: "constant", value }))] }] }] } });
  assert.deepEqual(presentation.nativeBodyHandPoseCues.map(cue => [cue.frame, cue.actorTag, cue.channel, cue.targetIndex]),
    [[0, "INE_", 2, 8]]);
});

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
