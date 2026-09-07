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
    "Usage: node tools/audio/build_d000_door_audio_pack.mjs "
    + "<F1DOBUIT DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/F1DOBUIT.SND",
);
const evidencePath = path.join(
  repoRoot,
  "tools/evidence/d000-door-audio.json",
);
const outputDirectory = path.join(
  repoRoot,
  "public/audio/world/f1dobuit",
);
const bank = readFileSync(bankPath);
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parsedBank = parseDTPK(bank);
const group = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "ab02",
);
if (!group) throw new Error("F1DOBUIT.SND does not declare group AB02");
const playbackById = new Map(
  parsedBank.playbacks.map((playback) => [playback.playbackId, playback]),
);

function commandHexFromRuntimeWord(word) {
  const value = Number.parseInt(word, 16) >>> 0;
  return Buffer.from([
    value & 0xff,
    value >>> 8 & 0xff,
    value >>> 16 & 0xff,
    value >>> 24 & 0xff,
  ]).toString("hex");
}

const commands = [...new Set(
  evidence.registrations.flatMap(({ soundCommands }) => (
    soundCommands
      .filter((command) => command !== "0xffffffff")
      .map(commandHexFromRuntimeWord)
  )),
)].sort();

function playbackForCommand(commandHex) {
  const track = Number.parseInt(commandHex.slice(4, 6), 16);
  const parsedTrack = group.tracks[track];
  if (
    !parsedTrack
    || !parsedTrack.playable
    || parsedTrack.entries.length !== 1
  ) {
    throw new Error(`${commandHex} is not a simple playable AB02 SFX`);
  }
  const entry = parsedTrack.entries[0];
  const playback = playbackById.get(entry.playbackId);
  if (!playback) {
    throw new Error(
      `${commandHex} references missing playback ${entry.playbackId}`,
    );
  }
  return {
    ...playback,
    track,
    volume: entry.volume,
    compositionHex: parsedTrack.compositionHex,
  };
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

function withSampleRate(input, sampleRate) {
  const output = Buffer.from(input);
  const blockAlign = output.readUInt16LE(32);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
  return output;
}

const decodedFiles = readdirSync(decodedDirectory);
function decodedSample(sampleId) {
  const marker = `_Sample_${sampleId.toString(16).padStart(2, "0")}_`;
  const filename = decodedFiles.find((candidate) => (
    candidate.toLowerCase().includes(marker.toLowerCase())
    && candidate.toLowerCase().endsWith(".wav")
  ));
  if (!filename) {
    throw new Error(`Decoded F1DOBUIT sample ${marker} was not found`);
  }
  return filename;
}

function encodeWebMOpus(input, commandHex) {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "new-yokosuka-door-audio-"),
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
        `FFmpeg failed for ${commandHex}: ${
          result.stderr.trim() || `exit ${result.status}`
        }`,
      );
    }
    const output = readFileSync(outputPath);
    const uid = createHash("sha256")
      .update(`f1dobuit:${commandHex}`)
      .digest()
      .subarray(0, 8);
    for (const marker of [
      Buffer.from([0x73, 0xc5, 0x88]),
      Buffer.from([0x63, 0xc5, 0x88]),
    ]) {
      const offset = output.indexOf(marker);
      if (offset < 0 || output.indexOf(marker, offset + 1) >= 0) {
        throw new Error(
          `${commandHex} does not contain one ${marker.toString("hex")} UID`,
        );
      }
      uid.copy(output, offset + marker.length);
    }
    return output;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

mkdirSync(outputDirectory, { recursive: true });
const tracks = [];
for (const commandHex of commands) {
  const playback = playbackForCommand(commandHex);
  const sourceFilename = decodedSample(playback.sampleId);
  const source = readFileSync(path.join(decodedDirectory, sourceFilename));
  const sampleRate = translateDTPKRate(playback.dtpkRate);
  if (!sampleRate) {
    throw new Error(
      `Unmapped DTPK rate 0x${playback.dtpkRate.toString(16)}`,
    );
  }
  const pcm = withSampleRate(
    repairedDTPKDumpWav(source, sourceFilename),
    sampleRate,
  );
  const output = encodeWebMOpus(pcm, commandHex);
  writeFileSync(path.join(outputDirectory, `${commandHex}.webm`), output);
  tracks.push({
    commandHex,
    track: playback.track,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    rawVolume: playback.volume,
    compositionHex: playback.compositionHex,
    decodedSource: sourceFilename,
    byteLength: output.length,
    sha256: sha256(output),
  });
}

const manifest = {
  schema: "new-yokosuka-d000-door-audio-pack-v1",
  generatedBy: "tools/audio/build_d000_door_audio_pack.mjs",
  source: {
    bank: path.relative(repoRoot, bankPath),
    byteLength: bank.length,
    sha256: sha256(bank),
    commandGroup: "ab02",
    evidence: path.relative(repoRoot, evidencePath),
    evidenceSha256: sha256(readFileSync(evidencePath)),
  },
  decoder: {
    repository: "https://github.com/Preppy/dtpkdump",
    commit: "a323c0e7e80af05e17e5bb291a9b20e55a3f9455",
    command: "python DTPKDump.py -wavconv F1DOBUIT.SND",
    wavNormalization: "remove DTPKDump's four 64-bit-size padding words",
  },
  encoding: {
    container: "webm",
    codec: "opus",
    bitRate: 48000,
    variableBitRate: true,
    application: "lowdelay",
  },
  purpose: "native D000 logical-door state-machine effects",
  tracks,
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${tracks.length} native F1DOBUIT door tracks to ${
    outputDirectory
  }.`,
);
