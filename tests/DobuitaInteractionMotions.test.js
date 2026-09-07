import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { MotnLoader } from "../src/MotnLoader.js";

function parseMotion(path) {
  const bytes = fs.readFileSync(path);
  return MotnLoader.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

test("bundles complete source-native Dobuita fixture interactions", () => {
  const street = parseMotion("play/assets/dobuita/M_D000.MOTN");
  const gacha = parseMotion("play/assets/dobuita/M_GACH.MOTN");
  const sequences = [
    [street, "AKI_HITORIGOTO_R_RYURIHATUTEN"],
    [street, "AKI_TORU_TELBOOK_90_F"],
    [street, "AKI_LOOK_TELBOOK_LP_F"],
    [street, "AKI_OKU_TELBOOK_90_F"],
    [street, "AKI_NAI_OKANE_B_POCKET_F"],
    [gacha, "AKI_ASOBU_GATYA"],
  ];

  for (const [motion, name] of sequences) {
    const sequence = motion.getSequence(name);
    assert.equal(sequence?.valid, true, `${name} is not valid`);
    assert.equal(
      sequence?.valueData?.complete,
      true,
      `${name} has incomplete value data`,
    );
    assert.equal(sequence?.motionBoneIds?.length, 20);
  }
});

test("uses the real low-byte MOTN count and excludes the table sentinel", () => {
  const street = parseMotion("play/assets/dobuita/M_D000.MOTN");
  const gacha = parseMotion("play/assets/dobuita/M_GACH.MOTN");

  assert.equal(street.header.sequenceCount, 26);
  assert.equal(street.sequences.length, 26);
  assert.ok(street.sequences.every((sequence) => sequence.name.length > 0));
  assert.equal(gacha.header.sequenceCount, 1);
  assert.equal(gacha.sequences.length, 1);
  assert.equal(gacha.header.motionDataEnd, 6048);
});

test("can expand only requested MOTN sequences for memory-constrained runtimes", () => {
  const bytes = fs.readFileSync("play/assets/dobuita/M_D000.MOTN");
  const motion = MotnLoader.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    { sequenceNames: ["AKI_LOOK_TELBOOK_LP_F"] },
  );

  assert.equal(motion.header.sequenceCount, 26);
  assert.deepEqual(
    motion.sequences.map((sequence) => sequence.name),
    ["AKI_LOOK_TELBOOK_LP_F"],
  );
  assert.equal(
    motion.getSequence("AKI_LOOK_TELBOOK_LP_F")?.valueData?.complete,
    true,
  );
  assert.equal(motion.getSequence("AKI_TORU_TELBOOK_90_F"), null);
});

const djhnMotionFixtures = [
  ".disc-work/exact/d000/unpacked/DJHN_MOT/M_JUCE2.MOTN",
  ".disc-work/exact/d000/unpacked/DJHN_MOT/M_JUCE3.MOTN",
];

test("uses the name-table span when DJHN package flags overlap the count", {
  skip: (
    !djhnMotionFixtures.every(fs.existsSync)
    && "requires locally extracted DJHN motion packages"
  ),
}, () => {
  const expected = [
    [
      ".disc-work/exact/d000/unpacked/DJHN_MOT/M_JUCE2.MOTN",
      [
        "AKI_AT2A_OGORU_WANTOJIDOUHANBAIKI_0100",
        "AKI_AT5B_OGORANAI_WANTOJIDOUHANBAIKI_0100",
        "JIJ_WAN_AT2A_OGORU_WANTOJIDOUHANBAIKI_0100",
        "JIJ_WAN_AT5B_OGORANAI_WANTOJIDOUHANBAIKI_0100",
      ],
    ],
    [
      ".disc-work/exact/d000/unpacked/DJHN_MOT/M_JUCE3.MOTN",
      [
        "AKI_AT2_SEIKOU_TOUKIYA_YANJIHANKI_0100",
        "AKI_AT4_NOMU_JUICE_WANTOJIDOUHANBAIKI_0100",
        "JIJ_WAN_AT4_NOMU_JUICE_WANTOJIDOUHANBAIKI_0100",
        "JIJ_YNN_AT2_SEIKOU_TOUKIYA_YANJIHANKI_0100",
      ],
    ],
  ];

  for (const [path, names] of expected) {
    const motion = parseMotion(path);
    assert.equal(motion.header.sequenceCount, 4);
    assert.equal(
      motion.header.sequenceCountMode,
      "absolute-name-table-span",
    );
    assert.deepEqual(
      motion.sequences.map((sequence) => sequence.name),
      names,
    );
    assert.ok(motion.sequences.every((sequence) => sequence.valid));
  }
});

test("recovers the full runtime MOTION table and telephone phases", {
  skip: (
    !fs.existsSync(".disc-work/runtime-motion/MOTION.BIN")
    && "requires the locally extracted runtime motion bank"
  ),
}, () => {
  const motion = parseMotion(".disc-work/runtime-motion/MOTION.BIN");
  assert.equal(motion.header.attributeSequenceCount, 23);
  assert.equal(motion.header.sequenceCount, 1559);
  assert.equal(
    motion.header.sequenceCountMode,
    "absolute-name-table-span",
  );
  for (const name of [
    "AKI_AKI_DENWA_TORU",
    "AKI_AKI_DENWA_LP",
    "AKI_AKI_DENWA_OKU",
  ]) {
    const sequence = motion.getSequence(name);
    assert.equal(sequence?.valid, true, `${name} is invalid`);
    assert.equal(sequence?.valueData?.complete, true, `${name} is incomplete`);
  }
});
