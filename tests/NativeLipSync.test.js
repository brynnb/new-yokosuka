import assert from "node:assert/strict";
import test from "node:test";

import {
  NATIVE_MOUTH_POSE_BY_SRF_SHAPE,
  NativeLipSyncCuePlayer,
  nativeLipSyncDescriptor,
  parseNativeSrfMouthCues,
  parseNativeSrfRecords,
  unpackNativeLipSync,
} from "../src/NativeLipSync.js";

test("SRF mouth cues retain exact shapes and 60 Hz durations", () => {
  const bytes = new Uint8Array([
    5, 0, 2, 0, 18, 0, 0, 0,
    0, 0, 2, 0, 4, 0, 0, 0,
    0xff, 0xff, 0xff, 0xff,
  ]);
  assert.deepEqual(parseNativeSrfMouthCues(bytes), [
    { shape: 5, durationTicks: 18 },
    { shape: 0, durationTicks: 4 },
  ]);
  assert.throws(
    () => parseNativeSrfMouthCues(bytes.subarray(0, bytes.length - 1)),
    /layout/,
  );
});

test("SRF records associate speaker and cue blocks in native order", () => {
  const block = (payload) => {
    const length = (payload.length + 7) & ~3;
    const result = new Uint8Array(length);
    new DataView(result.buffer).setUint32(0, length, true);
    result.set(payload, 4);
    return result;
  };
  const bytes = new Uint8Array([
    ...block(new TextEncoder().encode("KNJI")),
    ...block(new Uint8Array([
      0x48, 0x69, 0xa1, 0xf5, 0x74, 0x68, 0x65, 0x72, 0x65, 0x3d, 0x40,
    ])),
    ...block(new Uint8Array([
      5, 0, 2, 0, 18, 0, 0, 0,
      0xff, 0xff, 0xff, 0xff,
    ])),
  ]);
  const records = parseNativeSrfRecords(bytes);
  assert.equal(records.length, 1);
  assert.equal(records[0].speakerId, "KNJI");
  assert.equal(records[0].sourceText, "Hi＆there=@");
  assert.equal(records[0].displayText, "Hi\nthere...");
  assert.deepEqual(records[0].lipSync.cues, [
    { shape: 5, durationTicks: 18 },
  ]);
});

test("native cue playback uses the recovered pose map and transitions", () => {
  assert.deepEqual(NATIVE_MOUTH_POSE_BY_SRF_SHAPE, [0, 3, 2, 5, 4, 1]);
  const player = new NativeLipSyncCuePlayer();
  player.start(nativeLipSyncDescriptor([
    { shape: 5, durationTicks: 18 },
    { shape: 4, durationTicks: 5 },
    { shape: 0, durationTicks: 4 },
  ]));
  assert.deepEqual(player.snapshot(), {
    active: true,
    cueIndex: 0,
    pose: 1,
    genericOpen: true,
    transitionTicksRemaining: 4,
    cueFramesRemaining: 9,
    durationResidualTicks: 0,
    prefetched: false,
  });
  assert.equal(player.advance(4).prefetched, false);
  assert.equal(player.advance().pose, 4);
  assert.equal(player.snapshot().prefetched, true);
  assert.equal(player.advance(4).cueIndex, 1);
  assert.equal(player.snapshot().durationResidualTicks, 1);
  assert.equal(player.advance().pose, 0);
  assert.equal(player.snapshot().prefetched, true);
  assert.equal(player.advance().cueIndex, 2);
  assert.equal(player.advance(2).active, false);
});

test("packed message cues preserve exact shapes and durations", () => {
  const packed = "srf1:BRIAAAQA";
  assert.deepEqual(unpackNativeLipSync(packed), {
    format: "shenmue-srf-mouth-cues-v1",
    tickRate: 60,
    cues: [
      { shape: 5, durationTicks: 18 },
      { shape: 0, durationTicks: 4 },
    ],
  });
  const player = new NativeLipSyncCuePlayer();
  assert.equal(player.start(packed), true);
  assert.equal(player.snapshot().pose, 1);
  assert.throws(() => unpackNativeLipSync("srf1:AQ=="), /length/);
});
