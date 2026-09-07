import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  parseAuthSequence,
  resolveAuthMotions,
  resolveAuthSoundMotions,
} from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";

function bytes(path) {
  const buffer = fs.readFileSync(path);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function parseMotion(path) {
  return MotnLoader.parse(bytes(path));
}

function firstExisting(...paths) {
  return paths.find(fs.existsSync) || paths[0];
}

const fixtureRoot = firstExisting(
  ".disc-work/exact/d000",
);
const authRoot = `${fixtureRoot}/unpacked/DJHN`;
const motionPath = `${authRoot}/M_01JUCE.MOTN`;
const extractionFixturesAvailable = [
  ...Array.from(
    { length: 7 },
    (_, index) => `${authRoot}/SEQDATA${index + 1}.AUTH`,
  ),
  motionPath,
  `${fixtureRoot}/unpacked/AUTH/M_01TE.MOTN`,
  `${fixtureRoot}/unpacked/AUTH/SEQDATA0.AUTH`,
  `${fixtureRoot}/unpacked/BUSS/M_01BUS.MOTN`,
  `${fixtureRoot}/unpacked/BUSS/SEQDATA2.AUTH`,
  firstExisting(
    ".disc-work/runtime-motion/MOTION.BIN",
  ),
].every(fs.existsSync);
const extractionTest = (name, run) => test(name, {
  skip: (
    !extractionFixturesAvailable
    && "requires locally extracted AUTH and MOTN source files"
  ),
}, run);

test("parses validated AUTH sound records and the stop sentinel", () => {
  const data = new Uint8Array(88);
  const view = new DataView(data.buffer);
  data.set(Buffer.from("TRCK"), 0);
  view.setUint32(4, data.length, true);
  data.set(Buffer.from("ASEQ"), 8);
  view.setUint32(12, data.length - 8, true);
  view.setUint8(16, 0);
  view.setUint8(17, 5);
  view.setUint16(18, 0, true);
  view.setUint32(20, 120, true);

  view.setUint32(24, 0, true);
  view.setUint8(28, 2);
  view.setUint8(29, 2);
  data.set(Buffer.from("AKIR"), 32);
  view.setUint32(36, 0, true);
  view.setUint32(40, 0, true);

  view.setUint32(44, 35, true);
  view.setUint8(48, 6);
  view.setUint8(49, 3);
  data.set(Buffer.from("AKIR"), 52);
  data.set([0xa9, 0x04, 0x0d, 0x00], 56);
  view.setUint32(60, 7, true);
  // Adjacent records inherit the same group frame.
  view.setUint8(64, 6);
  view.setUint8(65, 3);
  data.set(Buffer.from("AKIR"), 68);
  data.set([0xff, 0xff, 0xff, 0xff], 72);
  view.setUint32(76, 8, true);
  view.setUint32(80, 0, true);
  view.setInt32(84, -1, true);

  const sequence = parseAuthSequence(data);
  assert.equal(sequence.durationFrames, 120);
  assert.equal(sequence.timelineComplete, true);
  assert.deepEqual(sequence.actors, ["AKIR"]);
  assert.deepEqual(sequence.sounds.map((sound) => ({
    recordOffset: sound.recordOffset,
    frame: sound.frame,
    actorTag: sound.actorTag,
    commandHex: sound.commandHex,
    eventIndex: sound.eventIndex,
    stop: sound.stop,
  })), [
    {
      recordOffset: 48,
      frame: 35,
      actorTag: "AKIR",
      commandHex: "a9040d00",
      eventIndex: 7,
      stop: false,
    },
    {
      recordOffset: 64,
      frame: 35,
      actorTag: "AKIR",
      commandHex: "ffffffff",
      eventIndex: 8,
      stop: true,
    },
  ]);
});

extractionTest("parses DJHN AUTH actor declarations and one-based MOTN references", () => {
  const sequence = parseAuthSequence(bytes(`${authRoot}/SEQDATA1.AUTH`));
  assert.deepEqual(sequence.actors, ["AKIR", "YKHI"]);
  assert.equal(sequence.durationFrames, 380);
  assert.equal(sequence.timelineComplete, true);
  assert.deepEqual(
    sequence.sounds.map((event) => [
      event.frame,
      event.actorTag,
      event.commandHex,
      event.eventIndex,
      event.stop,
    ]),
    [
      [31, "AKIR", "a9041400", 1, false],
      [50, "AKIR", "a9041500", 2, false],
      [67, "AKIR", "a9041400", 3, false],
      [84, "YKHI", "a9040d00", 4, false],
      [90, "AKIR", "ffffffff", 5, true],
      [120, "AKIR", "a9041200", 8, false],
      [267, "YKHI", "a9041300", 11, false],
      [302, "YKHI", "a9040200", 12, false],
    ],
  );
  assert.deepEqual(
    sequence.motions.map((event) => ({
      actorTag: event.actorTag,
      motionId: event.motionId,
      motionBank: event.motionBank,
      sequenceNumber: event.sequenceNumber,
      sequenceIndex: event.sequenceIndex,
      startFrame: event.startFrame,
      endFrame: event.endFrame,
    })),
    [
      {
        actorTag: "AKIR",
        motionId: 0x1010,
        motionBank: 0x10,
        sequenceNumber: 16,
        sequenceIndex: 15,
        startFrame: 201,
        endFrame: 726,
      },
      {
        actorTag: "YKHI",
        motionId: 0x1016,
        motionBank: 0x10,
        sequenceNumber: 22,
        sequenceIndex: 21,
        startFrame: 201,
        endFrame: 789,
      },
    ],
  );
});

extractionTest("uses the AUTH high byte as bank and low byte as sequence number", () => {
  const motionPackage = parseMotion(
    `${fixtureRoot}/unpacked/AUTH/M_01TE.MOTN`,
  );
  const sequence = resolveAuthMotions(
    parseAuthSequence(
      bytes(`${fixtureRoot}/unpacked/AUTH/SEQDATA0.AUTH`),
    ),
    motionPackage,
  );
  assert.deepEqual(
    sequence.map((event) => ({
      motionId: event.motionId,
      motionBank: event.motionBank,
      sequenceNumber: event.sequenceNumber,
      sequenceIndex: event.sequenceIndex,
      motionName: event.motionName,
      startFrame: event.startFrame,
      endFrame: event.endFrame,
    })),
    [{
      motionId: 0x1418,
      motionBank: 0x14,
      sequenceNumber: 24,
      sequenceIndex: 23,
      motionName: "AKI_SIRABERU_DENWATYOU_ETC_TABACOYA_0100",
      startFrame: 18,
      endFrame: 925,
    }],
  );
});

extractionTest("resolves every DJHN AUTH motion event to its exact MOTN sequence", () => {
  const motionPackage = parseMotion(motionPath);
  const expectedRyoMotions = [
    "AKI_AT1_WANTOJIDOUHANBAIKI_0100",
    "AKI_AT2A_OGORU_WANTOJIDOUHANBAIKI_0100",
    "AKI_AT2_SEIKOU_TOUKIYA_YANJIHANKI_0100",
    "AKI_AT4_NOMU_JUICE_WANTOJIDOUHANBAIKI_0100",
    "AKI_AT5A_MISERU_TEGAMI_WANTOJIDOUHANBAIKI_0100",
    "AKI_AT5B_OGORANAI_WANTOJIDOUHANBAIKI_0100",
    "AKI_AT5A_MISERU_TEGAMI_WANTOJIDOUHANBAIKI_0100",
  ];

  for (let number = 1; number <= 7; number += 1) {
    const sequence = parseAuthSequence(
      bytes(`${authRoot}/SEQDATA${number}.AUTH`),
    );
    const resolved = resolveAuthMotions(sequence, motionPackage);
    assert.ok(resolved.length >= 2);
    assert.ok(resolved.every((event) => event.motionValid));
    assert.equal(
      resolved.find((event) => event.actorTag === "AKIR")?.motionName,
      expectedRyoMotions[number - 1],
    );
  }
});

extractionTest("preserves repeated and clipped motion intervals in vending AUTH", () => {
  const sequence = resolveAuthMotions(
    parseAuthSequence(bytes(`${authRoot}/SEQDATA7.AUTH`)),
    parseMotion(motionPath),
  );
  const ryo = sequence.filter((event) => event.actorTag === "AKIR");
  assert.deepEqual(
    ryo.map((event) => [event.startFrame, event.endFrame]),
    [
      [101, 290],
      [841, 930],
      [831, 1315],
    ],
  );
  assert.ok(
    ryo.every(
      (event) => (
        event.motionName
        === "AKI_AT5A_MISERU_TEGAMI_WANTOJIDOUHANBAIKI_0100"
      ),
    ),
  );
});

extractionTest("maps AUTH sounds through actor timeline changes to local MOTN frames", () => {
  const parsed = parseAuthSequence(bytes(`${authRoot}/SEQDATA7.AUTH`));
  const resolved = resolveAuthSoundMotions(parsed, parseMotion(motionPath));
  assert.ok(resolved.every((event) => event.motionFrameResolved));
  assert.deepEqual(
    resolved
      .filter((event) => event.actorTag === "AKIR")
      .map((event) => [
        event.frame,
        event.commandHex,
        event.motionTimelineFrame,
        event.motionLocalFrame,
      ]),
    [
      [218, "a9041000", 191, 868],
      [246, "a9040200", 191, 896],
      [678, "a9040200", 281, 1228],
      [690, "a9041400", 281, 1240],
    ],
  );
});

extractionTest("resolves mixed AUTH banks against their respective MOTN packages", () => {
  const busPackage = parseMotion(
    `${fixtureRoot}/unpacked/BUSS/M_01BUS.MOTN`,
  );
  const runtimePackage = parseMotion(
    firstExisting(
      ".disc-work/runtime-motion/MOTION.BIN",
    ),
  );
  const resolved = resolveAuthMotions(
    parseAuthSequence(
      bytes(`${fixtureRoot}/unpacked/BUSS/SEQDATA2.AUTH`),
    ),
    new Map([
      [0x10, busPackage],
      [0x02, runtimePackage],
    ]),
  );
  assert.deepEqual(
    resolved.map((event) => [
      event.motionBank,
      event.sequenceNumber,
      event.motionName,
    ]),
    [
      [0x10, 7, "OTH_TKA_CHECKSURU_RYOUKIN_BUS_0100"],
      [0x10, 5, "AKI_ORIRU_WALK_BUS_0100"],
      [0x02, 223, "ARPD_072"],
      [0x02, 223, "ARPD_072"],
      [0x02, 223, "ARPD_072"],
    ],
  );
  assert.ok(resolved.every((event) => event.motionValid));
});
