#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
const decodedDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!sourceRoot || !decodedDirectory || !existsSync(decodedDirectory)) {
  throw new Error(
    "Usage: node tools/audio/build_d000_phone_controller_audio_pack.mjs "
    + "<F1DOBUIT DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/F1DOBUIT.SND",
);
const evidencePath = path.join(
  repoRoot,
  "tools/evidence/d000-phone-controller-sound-evidence.json",
);
const outputDirectory = path.join(repoRoot, "public/audio/world/f1dobuit");
const bank = readFileSync(bankPath);
const evidenceBytes = readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
if (
  evidence.status !== "verified"
  || sha256(bank) !== evidence.source.bank.sha256
  || bank.subarray(0, 4).toString("ascii") !== "DTPK"
) {
  throw new Error("F1DOBUIT source or phone-controller evidence changed");
}

const sequenceOffset = bank.readUInt32LE(0x2c);
const playbackOffset = bank.readUInt32LE(0x30);
const groupCount = bank.readUInt32LE(sequenceOffset) + 1;
const group = Array.from({ length: groupCount }, (_, index) => {
  const word = bank.readUInt32LE(sequenceOffset + 4 + index * 4);
  return { descriptor: word >>> 16, relativeOffset: word & 0xffff };
}).find(({ descriptor }) => descriptor === 0xa905);
if (!group) throw new Error("F1DOBUIT does not declare A905");

const trackTable = sequenceOffset + group.relativeOffset;
const trackCount = bank.readUInt32LE(trackTable) + 1;
const track = evidence.dtpkTrack.track;
if (trackCount !== evidence.dtpkTrack.groupTrackCount || track >= trackCount) {
  throw new Error("F1DOBUIT A905 track table changed");
}
const relativeTrackOffset = bank.readUInt32LE(trackTable + 4 + track * 4);
const nextTrackOffset = track + 1 < trackCount
  ? bank.readUInt32LE(trackTable + 4 + (track + 1) * 4)
  : bank.readUInt32LE(sequenceOffset + 8) & 0xffff;
let composition = bank.subarray(
  sequenceOffset + relativeTrackOffset,
  sequenceOffset + nextTrackOffset,
);
while (composition.at(-1) === 0) composition = composition.subarray(0, -1);
const compositionHex = composition.subarray(0, 6).toString("hex");
if (compositionHex !== evidence.dtpkTrack.compositionHex) {
  throw new Error(`A905:68 composition changed to ${compositionHex}`);
}

const playbackId = composition[2];
const playbackEntry = playbackOffset + 0x50 + playbackId * 0x40;
const sampleId = bank[playbackEntry + 2];
const dtpkRate = bank.readUInt16BE(playbackEntry + 10);
if (
  playbackId !== evidence.dtpkTrack.playbackId
  || sampleId !== evidence.dtpkTrack.sampleId
  || dtpkRate !== Number.parseInt(evidence.dtpkTrack.dtpkRate.slice(2), 16)
) {
  throw new Error("A905:68 playback descriptor changed");
}

const marker = `_Sample_${sampleId.toString(16).padStart(2, "0")}_`;
const sourceFilename = readdirSync(decodedDirectory).find(candidate => (
  candidate.toLowerCase().includes(marker.toLowerCase())
  && candidate.toLowerCase().endsWith(".wav")
));
if (!sourceFilename) throw new Error(`Decoded F1DOBUIT sample ${marker} missing`);
const input = readFileSync(path.join(decodedDirectory, sourceFilename));
if (
  input.subarray(0, 4).toString("ascii") !== "RIFF"
  || input.subarray(12, 16).toString("ascii") !== "WAVE"
  || input.subarray(44, 48).toString("ascii") !== "data"
) {
  throw new Error(`${sourceFilename} lacks DTPKDump's expected WAV layout`);
}
const pcm = Buffer.concat([
  input.subarray(0, 8),
  input.subarray(12, 24),
  input.subarray(28, 52),
  input.subarray(56),
]);
pcm.writeUInt32LE(pcm.length - 8, 4);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt32LE(evidence.dtpkTrack.sampleRate, 24);
pcm.writeUInt32LE(evidence.dtpkTrack.sampleRate * 2, 28);

const commandHex = evidence.scriptCall.commandHex;
const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "new-yokosuka-phone-controller-audio-"),
);
let output;
try {
  const inputPath = path.join(temporaryDirectory, `${commandHex}.wav`);
  const outputPath = path.join(temporaryDirectory, `${commandHex}.webm`);
  writeFileSync(inputPath, pcm);
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-fflags", "+bitexact",
    "-i", inputPath, "-map_metadata", "-1", "-c:a", "libopus",
    "-flags:a", "+bitexact", "-b:a", "48k", "-vbr", "on",
    "-application", "lowdelay", "-write_crc32", "0", outputPath,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `ffmpeg exited ${result.status}`);
  }
  output = readFileSync(outputPath);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, `${commandHex}.webm`), output);
const manifest = {
  schema: "new-yokosuka-d000-phone-controller-audio-pack-v1",
  generatedBy: "tools/audio/build_d000_phone_controller_audio_pack.mjs",
  source: {
    bank: path.relative(repoRoot, bankPath),
    byteLength: bank.length,
    sha256: sha256(bank),
    evidence: path.relative(repoRoot, evidencePath),
    evidenceSha256: sha256(evidenceBytes),
  },
  encoding: {
    container: "webm",
    codec: "opus",
    bitRate: 48000,
    application: "lowdelay",
  },
  purpose: "native D000 telephone-book controller sound command",
  tracks: [{
    commandHex,
    track,
    playbackId,
    sampleId,
    dtpkRate: evidence.dtpkTrack.dtpkRate,
    sampleRate: evidence.dtpkTrack.sampleRate,
    rawVolume: evidence.dtpkTrack.rawVolume,
    compositionHex,
    decodedSource: sourceFilename,
    byteLength: output.length,
    sha256: sha256(output),
  }],
};
writeFileSync(
  path.join(outputDirectory, "phone-controller-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Wrote ${commandHex} to ${outputDirectory}`);
