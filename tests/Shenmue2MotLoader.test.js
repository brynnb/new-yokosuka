import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  SHENMUE2_AREA_MOTION_BANK_FILES,
  Shenmue2MotLoader,
  resolveShenmue2NativeMotionId,
  shenmue2MotionControllerIndicesForSlot,
  shenmue2GenericNpcMotionFamily,
  shenmue2Mt7BodyValue,
  shenmue2Mt7MotionFamily,
  shenmue2NpcLocomotionMotionId,
  shenmue2NpcProfileIdleMotionId,
  shenmue2NpcTableIdleMotionId,
  shenmue2NpcTableMotionId,
} from "../src/Shenmue2MotLoader.js";

test("native S2 area motion IDs resolve through their registered MOT banks", () => {
  assert.deepEqual(resolveShenmue2NativeMotionId(0xa805), {
    motionId: 0xa805,
    bank: "npcWT00",
    sequenceIndex: 4,
  });
  assert.deepEqual(resolveShenmue2NativeMotionId(0xa806), {
    motionId: 0xa806,
    bank: "npcWT00",
    sequenceIndex: 5,
  });
  assert.deepEqual(resolveShenmue2NativeMotionId(0xa501), {
    motionId: 0xa501,
    bank: "npcWE00",
    sequenceIndex: 0,
  });
  assert.equal(resolveShenmue2NativeMotionId(0xa800), null);
  assert.equal(resolveShenmue2NativeMotionId(0xa807), null);
});

test("all bundled S2 area motion banks retain their native ID spans", () => {
  for (const [bank, filename] of Object.entries(
    SHENMUE2_AREA_MOTION_BANK_FILES,
  )) {
    const parsed = Shenmue2MotLoader.parse(fs.readFileSync(new URL(
      `../play/assets/shenmue2-motion/${filename}`,
      import.meta.url,
    )));
    const first = parsed.header.motionIdLowerBound + 1;
    const last = parsed.header.motionIdUpperBound - 1;
    assert.equal(resolveShenmue2NativeMotionId(first)?.bank, bank, filename);
    assert.equal(resolveShenmue2NativeMotionId(last)?.bank, bank, filename);
    assert.equal(parsed.sequences.length, last - first + 1, filename);
  }
});

test("native S2 standing-motion selection follows actor profile dimensions", () => {
  assert.equal(shenmue2NpcProfileIdleMotionId({
    ageCategory: 10, variant: 0, motionSubtype: 1,
  }, 0), 0xe108);
  assert.equal(shenmue2NpcProfileIdleMotionId({
    ageCategory: 10, variant: 0, motionSubtype: 1,
  }, 1), 0xe0f5);
  assert.equal(shenmue2NpcProfileIdleMotionId({
    ageCategory: 22, variant: 1, motionSubtype: 0,
  }, 0), 0x800f);
  assert.equal(shenmue2NpcProfileIdleMotionId({
    ageCategory: 62, variant: 1, motionSubtype: 2,
  }, 0), 0xe0f6);
});

const npcMotPath = new URL(
  "../.disc-work/shenmue2-disc1-native/NPC.MOT",
  import.meta.url,
);
const motionMotPath = new URL(
  "../play/assets/shenmue2-motion/MOTION.MOT",
  import.meta.url,
);
const motionEvidence = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-motion-format.json",
  import.meta.url,
)));

test("compact MOT evidence records the native reader and complete corpus", () => {
  assert.equal(
    motionEvidence.schema,
    "new-yokosuka-shenmue2-compact-motion-evidence-v6",
  );
  assert.equal(motionEvidence.nativeFunctions.compactCurveReader, "0x8c1cda80");
  assert.equal(motionEvidence.nativeFunctions.updateMotionSlots, "0x8c0ef220");
  assert.equal(motionEvidence.format.controllerCount, 22);
  assert.deepEqual(
    motionEvidence.format.rootTranslationChannels,
    ["x", "y", "z"],
  );
  assert.deepEqual(
    motionEvidence.banks.map(({ filename, nativeMotionIdRange }) => [
      filename,
      nativeMotionIdRange.first,
      nativeMotionIdRange.last,
    ]),
    [
      ["NPC.MOT", "0x8001", "0x8105"],
      ["NPC_TBL.MOT", "0xe001", "0xe3b7"],
      ["MOTION.MOT", "0xf001", "0xf130"],
    ],
  );
  assert.deepEqual(
    motionEvidence.nativeNpcSelectors.steadyLocomotion.motionIds.slice(0, 8),
    ["0xf03e", "0xf0ff", "0xf07e", "0xf084", "0xf09e", "0xf0d1",
      "0xf060", "0xf086"],
  );
  assert.deepEqual(
    motionEvidence.banks.map((bank) => [
      bank.filename,
      bank.sequenceCount,
      bank.validSequenceCount,
    ]),
    [
      ["NPC.MOT", 261, 261],
      ["NPC_TBL.MOT", 951, 951],
      ["MOTION.MOT", 304, 251],
    ],
  );
});

test("native S2 motion evidence preserves all five evaluated slots", () => {
  assert.equal(motionEvidence.nativeMotionSlots.count, 5);
  assert.equal(
    motionEvidence.nativeMotionSlots.updateLoop.defaultBlendFrames,
    8,
  );
  assert.deepEqual(
    motionEvidence.nativeMotionSlots.dispatcher.poseBufferOffsets,
    ["0x8", "0xe18", "0x11a8", "0x1578", "0x1af8"],
  );
  assert.equal(
    motionEvidence.nativeMotionSlots.dispatcher.slot34Installer,
    "0x8c1ce540",
  );
  assert.deepEqual(
    motionEvidence.nativeMotionSlots.dispatcher.applicationOrder,
    [0, 1, 2, 3, 4],
  );
  assert.ok(
    motionEvidence.nativeMotionSlots.runtimeTrace.observations.some(
      ({ slot, retainedMotionId, subsequentlyEvaluatedMotionId }) => (
        slot === 4
        && retainedMotionId === "0x80c3"
        && subsequentlyEvaluatedMotionId === "0xf086"
      ),
    ),
  );
});

test("native S2 motion slots retain their exact compact-controller groups", () => {
  assert.deepEqual(shenmue2MotionControllerIndicesForSlot(0), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(shenmue2MotionControllerIndicesForSlot(1), [8, 9, 10]);
  assert.deepEqual(shenmue2MotionControllerIndicesForSlot(2), [11, 12, 13]);
  assert.deepEqual(shenmue2MotionControllerIndicesForSlot(3), [14, 15, 16, 17]);
  assert.deepEqual(shenmue2MotionControllerIndicesForSlot(4), [18, 19, 20, 21]);
  assert.equal(shenmue2MotionControllerIndicesForSlot(5), null);
});

test("compact Shenmue II NPC.MOT curves preserve exact native boundaries", {
  skip: !fs.existsSync(npcMotPath),
}, () => {
  const parsed = Shenmue2MotLoader.parse(fs.readFileSync(npcMotPath));
  assert.equal(parsed.header.sequenceCount, 261);
  assert.equal(parsed.sequences.length, 261);
  for (const sequence of parsed.sequences) {
    assert.equal(sequence.valid, true, `sequence ${sequence.index}`);
    assert.equal(sequence.curves.length, 69, `sequence ${sequence.index}`);
    assert.equal(sequence.alignmentByte, 0, `sequence ${sequence.index}`);
    assert.ok(sequence.trailingByteLength >= 0, `sequence ${sequence.index}`);
    for (const curve of sequence.curves) {
      assert.equal(curve.samples.length, curve.interiorCount + 2);
      assert.equal(curve.samples[0].frame, 0);
      assert.equal(
        curve.samples.at(-1).frame,
        Math.max(0, sequence.durationFrames - 1),
      );
      for (let index = 1; index < curve.samples.length; index += 1) {
        assert.ok(
          curve.samples[index].frame >= curve.samples[index - 1].frame,
          `sequence ${sequence.index}, curve ${curve.curveIndex}`,
        );
      }
    }
  }
});

for (const [filename, expectedSequenceCount] of [
  ["NPC_TBL.MOT", 951],
  ["NPC_AK00.MOT", 2],
  ["NPC_WK00.MOT", 1],
  ["NPC_WN00.MOT", 3],
]) {
  const source = new URL(
    `../.disc-work/shenmue2-disc1-native/${filename}`,
    import.meta.url,
  );
  test(`${filename} decodes every native compact sequence`, {
    skip: !fs.existsSync(source),
  }, () => {
    const parsed = Shenmue2MotLoader.parse(fs.readFileSync(source));
    assert.equal(parsed.header.sequenceCount, expectedSequenceCount);
    assert.ok(parsed.sequences.every(({ valid }) => valid));
  });
}

test("Shenmue II compact MOT Hermite evaluation reaches authored endpoints", {
  skip: !fs.existsSync(npcMotPath),
}, () => {
  const [sequence] = Shenmue2MotLoader.parse(
    fs.readFileSync(npcMotPath),
    { sequenceIndices: [0] },
  ).sequences;
  for (const curve of sequence.curves) {
    assert.equal(
      Shenmue2MotLoader.sampleCurve(curve, 0),
      curve.samples[0].value,
    );
    assert.equal(
      Shenmue2MotLoader.sampleCurve(curve, sequence.durationFrames),
      curve.samples.at(-1).value,
    );
  }
});

test("S2 layered-arm transitions retain the native source value and half velocity", {
  skip: !fs.existsSync(motionMotPath),
}, () => {
  const resolved = resolveShenmue2NativeMotionId(0xf086);
  const [sequence] = Shenmue2MotLoader.parse(
    fs.readFileSync(motionMotPath),
    { sequenceIndices: [resolved.sequenceIndex] },
  ).sequences;
  const source = Shenmue2MotLoader.evaluateSequence(sequence, 17)
    .rotations[20];
  const velocity = Shenmue2MotLoader.evaluateSequenceDerivatives(sequence, 17)
    .rotations[20];

  // JN1's synchronized 0x80c3 layer was installed nine frames before the
  // captured primary frame 26. The live Dreamcast descriptors retain these
  // exact source values and half derivatives at their +0x0c/+0x08 fields.
  assert.deepEqual(source, {
    rx: -0.02667236328125,
    ry: -0.4980789184570313,
    rz: -0.0479736328125,
  });
  assert.ok(Math.abs(velocity.rx * 0.5 - -0.44269561767578125) < 1e-7);
  assert.ok(Math.abs(velocity.ry * 0.5 - 0.011562385596334934) < 1e-7);
  assert.equal(velocity.rz * 0.5, -0.08502197265625);
});

test("compact MOT samples are not multiplied by the sequence header half-float", {
  skip: !fs.existsSync(motionMotPath),
}, () => {
  const motionId = 0xf086;
  const resolved = resolveShenmue2NativeMotionId(motionId);
  const [sequence] = Shenmue2MotLoader.parse(
    fs.readFileSync(motionMotPath),
    { sequenceIndices: [resolved.sequenceIndex] },
  ).sequences;
  assert.equal(sequence.scale, 1.19921875);
  assert.equal(sequence.curves[3].samples[1].frame, 8);
  assert.equal(
    Shenmue2MotLoader.sampleCurve(sequence.curves[3], 8),
    sequence.curves[3].samples[1].rawValue,
  );
});

test("compact MOT exposes one root translation and 22 controller rotations", {
  skip: !fs.existsSync(npcMotPath),
}, () => {
  const [sequence] = Shenmue2MotLoader.parse(
    fs.readFileSync(npcMotPath),
    { sequenceIndices: [0] },
  ).sequences;
  assert.deepEqual(
    sequence.curves.slice(0, 6).map(({ kind, controllerIndex, channel }) => (
      [kind, controllerIndex, channel]
    )),
    [
      ["rootPosition", 0, "x"],
      ["rootPosition", 0, "y"],
      ["rootPosition", 0, "z"],
      ["rotation", 0, "rx"],
      ["rotation", 0, "ry"],
      ["rotation", 0, "rz"],
    ],
  );
  const pose = Shenmue2MotLoader.evaluateSequence(sequence, 0);
  assert.deepEqual(Object.keys(pose.rootPosition), ["x", "y", "z"]);
  assert.equal(pose.rotations.length, 22);
});

test("generic NPC body families resolve through native locomotion selectors", () => {
  // Actor-code suffixes are retained only as identifiers. The native selector
  // reads the model's 0x7001-based MT7 root type through the IMGM table.
  assert.equal(shenmue2GenericNpcMotionFamily("00A_"), 0);
  assert.equal(shenmue2GenericNpcMotionFamily("18H_"), 7);
  assert.equal(shenmue2GenericNpcMotionFamily("RYO_"), null);
  assert.equal(shenmue2Mt7BodyValue(0x7001), 0);
  assert.equal(shenmue2Mt7BodyValue(0x702a), 41);
  assert.equal(shenmue2Mt7MotionFamily(0x7001), 0);
  assert.equal(shenmue2Mt7MotionFamily(0x7005), 4);
  assert.equal(shenmue2Mt7MotionFamily(0x7007), 6);
  assert.equal(shenmue2Mt7MotionFamily(0x7008), 7);
  assert.equal(shenmue2Mt7MotionFamily(0x702a), 9);
  assert.equal(shenmue2Mt7MotionFamily(0x7061), 1);
  assert.equal(shenmue2Mt7MotionFamily(0x7000), null);
  assert.equal(shenmue2NpcLocomotionMotionId(
    shenmue2Mt7MotionFamily(0x7005),
  ), 0xf09e);
  assert.equal(
    shenmue2NpcLocomotionMotionId(
      shenmue2Mt7MotionFamily(0x7008),
      { transition: true },
    ),
    0xf087,
  );
});

test("Shenmue II encoded motion IDs resolve through their native bank ranges", () => {
  assert.deepEqual(resolveShenmue2NativeMotionId(0x80c3), {
    motionId: 0x80c3,
    bank: "npc",
    sequenceIndex: 194,
  });
  assert.deepEqual(resolveShenmue2NativeMotionId(0xe024), {
    motionId: 0xe024,
    bank: "npcTable",
    sequenceIndex: 35,
  });
  assert.deepEqual(resolveShenmue2NativeMotionId(0xe101), {
    motionId: 0xe101,
    bank: "npcTable",
    sequenceIndex: 256,
  });
  assert.deepEqual(resolveShenmue2NativeMotionId(0xf03e), {
    motionId: 0xf03e,
    bank: "motion",
    sequenceIndex: 61,
  });
  assert.equal(shenmue2NpcTableMotionId(3, 0), 0xe034);
  assert.equal(shenmue2NpcTableIdleMotionId(3), 0xe035);
  assert.equal(resolveShenmue2NativeMotionId(0xe000), null);
});
