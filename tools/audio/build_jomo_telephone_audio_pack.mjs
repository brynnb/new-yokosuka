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
import {
  parseDTPK,
  translateDTPKRate,
} from "../lib/dtpk.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceCandidates = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean);
const sourceRoot = sourceCandidates.find(existsSync);
if (!sourceRoot) {
  throw new Error(
    `Disc 1 extraction not found. Tried: ${sourceCandidates.join(", ")}`,
  );
}

const decodedDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;
if (!decodedDirectory || !existsSync(decodedDirectory)) {
  throw new Error(
    "Usage: node tools/audio/build_jomo_telephone_audio_pack.mjs "
    + "<F1OMOYAA.SND DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/F1OMOYAA.SND",
);
const evidencePath = path.join(
  repoRoot,
  "tools/evidence/jomo-telephone-audio.json",
);
const outputDirectory = path.join(
  repoRoot,
  "public/audio/world/f1omoyaa",
);
const expectedBankHash =
  "41cdccd04ef8f4835a946f3f1ada404d4f1607adbae6c4bf8da5b825d23c9abb";
const commandHex = "ab060100";
const sha256 = (bytes) => (
  createHash("sha256").update(bytes).digest("hex")
);
const bank = readFileSync(bankPath);
if (sha256(bank) !== expectedBankHash) {
  throw new Error("F1OMOYAA.SND SHA-256 changed");
}
const evidenceBytes = readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes);
if (
  evidence.schema !== "new-yokosuka-jomo-telephone-audio-v1"
  || evidence.literalPhoneEvent.locationCue.commandHex !== commandHex
  || evidence.literalPhoneEvent.locationCue.bank !== "F1OMOYAA.SND"
) {
  throw new Error("JOMO telephone evidence no longer selects AB06:1");
}

const parsed = parseDTPK(bank);
const group = parsed.groups.find(
  ({ descriptorHex }) => descriptorHex === "ab06",
);
const parsedTrack = group?.tracks[1];
if (
  group?.trackCount !== 2
  || parsedTrack?.commandHex !== commandHex
  || !parsedTrack.playable
  || parsedTrack.entries.length !== 1
) {
  throw new Error("F1OMOYAA AB06:1 composition changed");
}
const entry = parsedTrack.entries[0];
const playback = parsed.playbacks.find(
  ({ playbackId }) => playbackId === entry.playbackId,
);
if (
  !playback
  || playback.playbackId !== 73
  || playback.sampleId !== 26
  || entry.volume !== 95
) {
  throw new Error("F1OMOYAA AB06:1 playback route changed");
}
const sampleRate = translateDTPKRate(playback.dtpkRate);
if (sampleRate !== 11025) {
  throw new Error("F1OMOYAA AB06:1 sample rate changed");
}

const decodedFiles = readdirSync(decodedDirectory);
const marker = "_Sample_1A_";
const sourceFilename = decodedFiles.find((candidate) => (
  candidate.includes(marker) && candidate.toLowerCase().endsWith(".wav")
));
if (!sourceFilename) {
  throw new Error(`Decoded F1OMOYAA sample ${marker} was not found`);
}

function repairedDTPKDumpWav(input, filename) {
  if (
    input.subarray(0, 4).toString("ascii") !== "RIFF"
    || input.subarray(12, 16).toString("ascii") !== "WAVE"
    || input.subarray(16, 20).toString("ascii") !== "fmt "
    || input.subarray(44, 48).toString("ascii") !== "data"
  ) {
    throw new Error(`${filename} does not have the known 64-bit WAV layout`);
  }
  const output = Buffer.concat([
    input.subarray(0, 8),
    input.subarray(12, 24),
    input.subarray(28, 52),
    input.subarray(56),
  ]);
  const channels = output.readUInt16LE(22);
  const bitsPerSample = output.readUInt16LE(34);
  const blockAlign = channels * bitsPerSample / 8;
  const dataLength = output.readUInt32LE(40);
  if (
    output.subarray(8, 12).toString("ascii") !== "WAVE"
    || output.subarray(36, 40).toString("ascii") !== "data"
    || output.length !== 44 + dataLength
    || !Number.isInteger(blockAlign)
  ) {
    throw new Error(`${filename} could not be normalized to PCM WAV`);
  }
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt16LE(blockAlign, 32);
  return output;
}

function withSampleRate(input, rate) {
  const output = Buffer.from(input);
  const blockAlign = output.readUInt16LE(32);
  output.writeUInt32LE(rate, 24);
  output.writeUInt32LE(rate * blockAlign, 28);
  return output;
}

function encodeWebMOpus(input) {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "new-yokosuka-jomo-telephone-"),
  );
  const inputPath = path.join(temporaryDirectory, `${commandHex}.wav`);
  const outputPath = path.join(temporaryDirectory, `${commandHex}.webm`);
  try {
    writeFileSync(inputPath, input);
    const result = spawnSync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-fflags", "+bitexact",
      "-i", inputPath,
      "-map_metadata", "-1",
      "-c:a", "libopus",
      "-flags:a", "+bitexact",
      "-b:a", "48k",
      "-vbr", "on",
      "-application", "lowdelay",
      "-write_crc32", "0",
      outputPath,
    ], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        `FFmpeg failed: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    }
    const output = readFileSync(outputPath);
    const uid = createHash("sha256")
      .update(`f1omoyaa:${commandHex}`)
      .digest()
      .subarray(0, 8);
    for (const uidMarker of [
      Buffer.from([0x73, 0xc5, 0x88]),
      Buffer.from([0x63, 0xc5, 0x88]),
    ]) {
      const offset = output.indexOf(uidMarker);
      if (offset < 0 || output.indexOf(uidMarker, offset + 1) >= 0) {
        throw new Error(
          `${commandHex} does not contain exactly one WebM UID marker`,
        );
      }
      uid.copy(output, offset + uidMarker.length);
    }
    return output;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const source = readFileSync(path.join(decodedDirectory, sourceFilename));
const pcm = withSampleRate(
  repairedDTPKDumpWav(source, sourceFilename),
  sampleRate,
);
const output = encodeWebMOpus(pcm);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, `${commandHex}.webm`), output);
const manifest = {
  schema: "new-yokosuka-jomo-telephone-audio-pack-v1",
  generatedBy: "tools/audio/build_jomo_telephone_audio_pack.mjs",
  source: {
    bank: "extracted_files/data/SCENE/01/SOUND/F1OMOYAA.SND",
    bankSha256: expectedBankHash,
    evidence: "tools/evidence/jomo-telephone-audio.json",
    evidenceSha256: sha256(evidenceBytes),
    decoder: {
      tool: "DTPKDump",
      commit: "a323c0e7e80af05e17e5bb291a9b20e55a3f9455",
    },
  },
  encoding: {
    container: "WebM",
    codec: "Opus",
    bitrate: "48k",
    application: "lowdelay",
  },
  tracks: [{
    commandHex,
    group: "ab06",
    track: 1,
    compositionHex: parsedTrack.compositionHex,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    rawVolume: entry.volume,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    decodedSource: sourceFilename,
    asset: `${commandHex}.webm`,
    byteLength: output.length,
    sha256: sha256(output),
  }],
  runtimeStatus: (
    "Packaged from the exact JOMO location bank but intentionally unwired "
    + "until the owning E1032 incoming-call state is implemented."
  ),
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${path.relative(repoRoot, outputDirectory)}: `
  + `${output.length} encoded bytes`,
);
