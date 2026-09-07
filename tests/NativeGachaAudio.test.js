import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import test from "node:test";
import { INTERACTION_EMOTES } from "../play/config/animations.js";
import { parseDTPK } from "../tools/lib/dtpk.mjs";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/d000-gacha-audio.json",
    import.meta.url,
  ),
));
const manifest = JSON.parse(readFileSync(
  new URL(
    "../public/audio/world/e1gachap/manifest.json",
    import.meta.url,
  ),
));

test("D000 gacha evidence retains all six exact native command paths", () => {
  assert.equal(evidence.status, "verified");
  assert.equal(evidence.authoredMotion.sequence, "AKI_ASOBU_GATYA");
  assert.equal(evidence.authoredMotion.durationFrames, 540);
  assert.deepEqual(
    evidence.sounds.map(({ commandHex }) => commandHex).sort(),
    [
      "a9040000",
      "a9040100",
      "a9040200",
      "a9040300",
      "a9040400",
      "a9040500",
    ],
  );
  const verified = evidence.sounds.filter(
    ({ timing }) => timing.status === "verified-motion-frame",
  );
  assert.deepEqual(
    verified.map(({ commandHex, timing }) => [
      commandHex,
      timing.motionFrame,
    ]),
    [["a9040200", 360]],
  );
});

test("runtime gacha cues are exactly the statically verified subset", () => {
  const emote = INTERACTION_EMOTES.find(
    ({ id }) => id === "dobuitaGacha",
  );
  assert.ok(emote);
  assert.deepEqual(
    emote.audioCues.loop.map(({ commandHex, frame, bank }) => ({
      commandHex,
      frame,
      bank,
    })),
    evidence.sounds
      .filter(({ timing }) => timing.status === "verified-motion-frame")
      .map(({ commandHex, timing }) => ({
        commandHex,
        frame: timing.motionFrame,
        bank: "e1gachap",
      })),
  );
});

test("E1GACHAP pack preserves native DTPK volume, rate, and assets", () => {
  assert.equal(
    manifest.schema,
    "new-yokosuka-d000-gacha-audio-pack-v1",
  );
  assert.equal(manifest.source.commandGroup, "a904");
  assert.equal(manifest.source.commandGroupTrackCount, 6);
  assert.deepEqual(
    manifest.tracks.map(({ rawVolume }) => rawVolume),
    [0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x41],
  );
  assert.deepEqual(
    manifest.tracks.map(({ sampleRate }) => sampleRate),
    [22050, 16000, 22050, 16000, 22050, 16000],
  );
  for (const track of manifest.tracks) {
    assert.ok(existsSync(new URL(
      `../public/audio/world/e1gachap/${track.commandHex}.webm`,
      import.meta.url,
    )));
  }
});

const bankCandidates = [
  new URL(
    "../extracted_files/data/SCENE/01/SOUND/E1GACHAP.SND",
    import.meta.url,
  ),
];
const bankUrl = bankCandidates.find(existsSync);
test(
  "known E1GACHAP bank is one six-track simple A904 group",
  { skip: !bankUrl },
  () => {
    const bank = parseDTPK(readFileSync(bankUrl));
    assert.equal(bank.groups.length, 1);
    assert.equal(bank.groups[0].descriptorHex, "a904");
    assert.equal(bank.groups[0].trackCount, 6);
    assert.ok(bank.groups[0].tracks.every(
      (track) => track.playable && track.entries.length === 1,
    ));
  },
);
