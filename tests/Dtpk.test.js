import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import {
  parseDTPK,
  translateDTPKRate,
} from "../tools/lib/dtpk.mjs";

function syntheticBank() {
  const sequenceOffset = 0x40;
  const playbackOffset = 0x70;
  const samplesOffset = 0x140;
  const sampleDataOffset = 0x164;
  const bytes = Buffer.alloc(sampleDataOffset + 30);
  bytes.write("DTPK", 0, "ascii");
  bytes.writeUInt32LE(7, 0x04);
  bytes.writeUInt32LE(bytes.length, 0x08);
  bytes.writeUInt32LE(sequenceOffset, 0x2c);
  bytes.writeUInt32LE(playbackOffset, 0x30);
  bytes.writeUInt32LE(samplesOffset, 0x3c);

  bytes.writeUInt32LE(0, sequenceOffset);
  bytes.writeUInt32LE((0xa903 * 0x10000) + 0x08, sequenceOffset + 4);
  bytes.writeUInt32LE(1, sequenceOffset + 0x08);
  bytes.writeUInt32LE(0x14, sequenceOffset + 0x0c);
  bytes.writeUInt32LE(0x1a, sequenceOffset + 0x10);
  Buffer.from("c0df006080ff", "hex").copy(bytes, sequenceOffset + 0x14);
  Buffer.from(
    "c0df00600080df016080ff",
    "hex",
  ).copy(bytes, sequenceOffset + 0x1a);

  bytes.writeUInt16LE(1, playbackOffset + 0x10);
  for (let playbackId = 0; playbackId < 2; playbackId += 1) {
    const offset = playbackOffset + 0x50 + playbackId * 0x40;
    bytes[offset] = playbackId;
    bytes[offset + 1] = 0x80;
    bytes[offset + 2] = 0;
    bytes[offset + 3] = 1;
    bytes[offset + 6] = 0x80;
    bytes[offset + 7] = 0x0c;
    bytes.writeUInt16BE(0xe800, offset + 10);
  }

  bytes.writeUInt32LE(0, samplesOffset);
  bytes.writeUInt32LE(
    sampleDataOffset | 0x01000000 | 0x02000000,
    samplesOffset + 4,
  );
  bytes.writeUInt16LE(4, samplesOffset + 8);
  bytes.writeUInt16LE(60, samplesOffset + 10);
  bytes.writeUInt32LE(0, samplesOffset + 12);
  bytes.writeUInt32LE(30, samplesOffset + 16);
  for (let index = 0; index < 30; index += 1) {
    bytes[sampleDataOffset + index] = index;
  }
  return bytes;
}

test("DTPK parser joins commands to playback and native sample provenance", () => {
  const parsed = parseDTPK(syntheticBank());
  assert.equal(parsed.id, 7);
  assert.equal(parsed.groups[0].descriptorHex, "a903");
  assert.equal(parsed.groups[0].trackCount, 2);
  assert.equal(parsed.groups[0].tracks[0].commandHex, "a9030000");
  assert.deepEqual(
    parsed.groups[0].tracks[1].entries.map((entry) => ({
      playbackId: entry.playbackId,
      sampleId: entry.sampleId,
      sampleRate: entry.sampleRate,
    })),
    [
      { playbackId: 0, sampleId: 0, sampleRate: 11025 },
      { playbackId: 1, sampleId: 0, sampleRate: 11025 },
    ],
  );
  assert.equal(parsed.samples[0].format, "yamaha-aica-adpcm");
  assert.deepEqual(parsed.samples[0].authoredLoop, {
    startSample: 4,
    endSample: 60,
  });
  assert.match(parsed.samples[0].sha256, /^[0-9a-f]{64}$/);
});

test("DTPK rate translation stays evidence-bounded", () => {
  assert.equal(translateDTPKRate(0xe800), 11025);
  assert.equal(translateDTPKRate(0xee1d), 16000);
  assert.equal(translateDTPKRate(0), 44100);
  assert.equal(translateDTPKRate(0xca1d), null);
});

const disc1BusBank = path.resolve(
  "extracted_files/data/SCENE/01/SOUND/A1_BUSNO.SND",
);

test("Shenmue bus playback variants retain exact playback-table identity", {
  skip: !existsSync(disc1BusBank),
}, () => {
  const parsed = parseDTPK(readFileSync(disc1BusBank));
  const track = parsed.groups.flatMap(group => group.tracks)
    .find(candidate => candidate.commandHex === "a9040400");
  assert.equal(track?.compositionHex, "c0d7045080ff");
  assert.equal(track?.kind, "sfx");
  assert.equal(track?.playable, true);
  assert.deepEqual(track?.entries.map(entry => ({
    type: entry.type,
    playbackId: entry.playbackId,
    playbackResolved: entry.playbackResolved,
  })), [{ type: 0xd7, playbackId: 4, playbackResolved: true }]);
});

const disc3Candidates = [
  process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
  path.resolve("extracted_disc3_v2"),
].filter(Boolean);
const disc3Root = disc3Candidates.find(existsSync);

test("real forklift bank parses without its former hand-authored tables", {
  skip: !disc3Root,
}, () => {
  const parsed = parseDTPK(readFileSync(path.join(
    disc3Root,
    "data/SCENE/03/SOUND/E1FORKLI.SND",
  )));
  assert.equal(parsed.sha256,
    "171e106f04972a5bb34ae1113cdaa47208f7cafb65b3814a5202a20da97933fc");
  assert.equal(parsed.groups[0].descriptorHex, "a904");
  assert.equal(parsed.groups[0].trackCount, 26);
  assert.equal(parsed.playbacks.length, 19);
  assert.equal(parsed.samples.length, 20);
  assert.deepEqual(
    parsed.samples
      .filter(({ authoredLoop }) => authoredLoop)
      .map(({ sampleId }) => sampleId),
    [0, 2, 7, 8, 11, 12, 19],
  );
});
