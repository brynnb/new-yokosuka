#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
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
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
const decodedDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;
if (!sourceRoot || !decodedDirectory || !existsSync(decodedDirectory)) {
  throw new Error(
    "Usage: node tools/audio/build_jomo_goro_telephone_audio_pack.mjs "
    + "<F1OMOYAA.SND DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/F1OMOYAA.SND",
);
const slicePath = path.join(
  repoRoot,
  "tools/evidence/jomo-goro-telephone-vertical-slice.json",
);
const inventoryPath = path.join(
  repoRoot,
  "tools/evidence/native-audio-bank-inventory.json",
);
const outputDirectory = path.join(
  repoRoot,
  "public/audio/world/f1omoyaa",
);
const expectedBankHash =
  "41cdccd04ef8f4835a946f3f1ada404d4f1607adbae6c4bf8da5b825d23c9abb";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function nativeCommandHex(wordText) {
  const value = Number.parseInt(String(wordText).replace(/^0x/i, ""), 16);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`Invalid native sound command ${wordText}`);
  }
  return [0, 8, 16, 24]
    .map(shift => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

const bank = readFileSync(bankPath);
if (sha256(bank) !== expectedBankHash) {
  throw new Error("F1OMOYAA.SND SHA-256 changed");
}
const sliceBytes = readFileSync(slicePath);
const slice = JSON.parse(sliceBytes);
const inventoryBytes = readFileSync(inventoryPath);
const inventory = JSON.parse(inventoryBytes);
const inventoryBank = inventory.banks?.find(candidate => (
  candidate.sha256 === expectedBankHash
  && candidate.sources?.some(source => (
    source.disc === 1
    && source.path === "SCENE/01/SOUND/F1OMOYAA.SND"
  ))
));
if (
  slice.schema !== "new-yokosuka-jomo-goro-telephone-vertical-slice-v1"
  || !inventoryBank
) {
  throw new Error("JOMO telephone source evidence changed");
}

const commands = [
  {
    phase: "ring",
    commandHex: nativeCommandHex(slice.sharedPhysicalSequence.ringSoundCommand),
    group: "a905",
    track: 101,
    playbackId: 57,
    sampleId: 13,
    rawVolume: 127,
  },
  {
    phase: "answer",
    commandHex: nativeCommandHex(
      slice.sharedPhysicalSequence.answerHelper.soundCommand,
    ),
    group: "ab06",
    track: 0,
    playbackId: 72,
    sampleId: 27,
    rawVolume: 121,
  },
  {
    phase: "hangup",
    commandHex: nativeCommandHex(
      slice.sharedPhysicalSequence.hangupHelper.soundCommand,
    ),
    group: "ab06",
    track: 1,
    playbackId: 73,
    sampleId: 26,
    rawVolume: 95,
  },
];

const parsed = parseDTPK(bank);
for (const command of commands) {
  const group = parsed.groups.find(
    candidate => candidate.descriptorHex === command.group,
  );
  const track = group?.tracks[command.track];
  const entry = track?.entries?.[0];
  const playback = parsed.playbacks.find(
    candidate => candidate.playbackId === entry?.playbackId,
  );
  if (
    track?.commandHex !== command.commandHex
    || track?.playable !== true
    || track.entries.length !== 1
    || entry.playbackId !== command.playbackId
    || entry.volume !== command.rawVolume
    || playback?.sampleId !== command.sampleId
    || translateDTPKRate(playback.dtpkRate) !== 11025
  ) {
    throw new Error(`${command.phase} command route changed`);
  }
  command.compositionHex = track.compositionHex;
  command.dtpkRate = playback.dtpkRate;
  command.sampleRate = translateDTPKRate(playback.dtpkRate);
}

const decodedFiles = readdirSync(decodedDirectory);
function decodedSample(sampleId) {
  const marker = `_Sample_${sampleId.toString(16).padStart(2, "0")}_`;
  const filename = decodedFiles.find(candidate => (
    candidate.toLowerCase().includes(marker.toLowerCase())
    && candidate.toLowerCase().endsWith(".wav")
  ));
  if (!filename) {
    throw new Error(`Decoded F1OMOYAA sample ${marker} was not found`);
  }
  return filename;
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

mkdirSync(outputDirectory, { recursive: true });
const tracks = commands.map((command) => {
  const sourceFilename = decodedSample(command.sampleId);
  const source = readFileSync(path.join(decodedDirectory, sourceFilename));
  const pcm = withSampleRate(
    repairedDTPKDumpWav(source, sourceFilename),
    command.sampleRate,
  );
  const asset = `${command.commandHex}.wav`;
  writeFileSync(
    path.join(outputDirectory, asset),
    pcm,
  );
  return {
    ...command,
    dtpkRate: `0x${command.dtpkRate.toString(16).padStart(4, "0")}`,
    decodedSource: sourceFilename,
    asset,
    byteLength: pcm.length,
    sha256: sha256(pcm),
  };
});

const manifest = {
  schema: "new-yokosuka-jomo-goro-telephone-audio-pack-v1",
  generatedBy: "tools/audio/build_jomo_goro_telephone_audio_pack.mjs",
  source: {
    bank: "extracted_files/data/SCENE/01/SOUND/F1OMOYAA.SND",
    bankSha256: expectedBankHash,
    evidence: [
      {
        path: "tools/evidence/jomo-goro-telephone-vertical-slice.json",
        sha256: sha256(sliceBytes),
      },
      {
        path: "tools/evidence/native-audio-bank-inventory.json",
        sha256: sha256(inventoryBytes),
      },
    ],
    decoder: {
      tool: "DTPKDump",
      commit: "a323c0e7e80af05e17e5bb291a9b20e55a3f9455",
    },
  },
  encoding: {
    container: "WAV",
    codec: "PCM signed 16-bit little-endian",
    channels: 1,
  },
  purpose: "exact JOMO Goro incoming-call ring, answer, and hang-up cues",
  tracks,
};
writeFileSync(
  path.join(outputDirectory, "goro-telephone-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${tracks.length} JOMO Goro telephone cues to ${outputDirectory}`,
);
