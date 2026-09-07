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
import { parseDTPK } from "../lib/dtpk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceCandidates = [
  process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_disc3_v2"),
].filter(Boolean);
const sourceRoot = sourceCandidates.find(existsSync);
if (!sourceRoot) {
  throw new Error(
    `Disc 3 extraction not found. Tried: ${sourceCandidates.join(", ")}`,
  );
}
const decodedDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;
if (!decodedDirectory || !existsSync(decodedDirectory)) {
  throw new Error(
    "Usage: node tools/audio/build_forklift_audio_pack.mjs "
    + "<DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/03/SOUND/E1FORKLI.SND",
);
const bank = readFileSync(bankPath);
const expectedBankSha256 =
  "171e106f04972a5bb34ae1113cdaa47208f7cafb65b3814a5202a20da97933fc";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  bank.subarray(0, 4).toString("ascii") !== "DTPK"
  || sha256(bank) !== expectedBankSha256
) {
  throw new Error(`${bankPath} is not the reverse-engineered E1FORKLI bank`);
}

const parsedBank = parseDTPK(bank);
const commandGroup = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "a904",
);
if (!commandGroup) throw new Error("E1FORKLI.SND does not declare group A904");
// Exact E1FORKLI A904 table recovered directly from the DTPK sequencer.
// Tracks whose volume is zero are native stop mates and emit no browser asset.
const tracks = commandGroup.tracks
  .filter(({ playable }) => playable)
  .map((track) => {
    if (track.entries.length !== 1) {
      throw new Error(`A904 track ${track.track} is not a simple SFX command`);
    }
    return {
      track: track.track,
      playbackId: track.entries[0].playbackId,
      volume: track.entries[0].volume,
      compositionHex: track.compositionHex,
    };
  });
const playbackSamples = new Map([
  [0, [3]], [1, [0]], [2, [18]], [4, [13]], [6, [15]],
  [7, [17]], [8, [13]], [9, [14]], [10, [5]], [11, [6]],
  [12, [2]], [13, [1]], [14, [10, 11, 12]], [15, [7, 8]],
  [16, [19]], [17, [16]], [18, [9]],
]);
const playbackRates = new Map([
  [13, 11025], [14, 11025], [16, 16000], [17, 4400], [18, 11025],
]);
const sampleLoops = new Map(
  parsedBank.samples
    .filter(({ authoredLoop }) => authoredLoop)
    .map(({ sampleId, authoredLoop }) => [
      sampleId,
      [authoredLoop.startSample, authoredLoop.endSample],
    ]),
);
// Human-audited names from listening to the decoded native samples. Unknown
// commands deliberately remain unnamed rather than receiving inferred roles.
const identifiedFunctions = new Map([
  ["a9040000.webm", "forklift-flipping"],
  ["a9040100.webm", "startup"],
  ["a9040100-loop.webm", "startup-loop-region"],
  ["a9040300.webm", "shutdown"],
  ["a9040500.webm", "horn"],
  ["a9040a00.webm", "forklift-ground-impact"],
  ["a9040d00-loop.webm", "reverse-beep"],
  ["a9041000-v1.webm", "engine-moving"],
  ["a9041000-v1-loop.webm", "engine-moving-loop"],
  ["a9041000-v2.webm", "engine-idle"],
  ["a9041000-v2-loop.webm", "engine-idle-loop"],
  ["a9041100-v0.webm", "tines-moving-down-start"],
  ["a9041100-v0-loop.webm", "tines-moving-down-loop"],
  ["a9041300.webm", "tines-moving-up-start"],
  ["a9041300-loop.webm", "tines-moving-up-loop"],
  ["a9041500.webm", "end-of-day-siren"],
]);
const outputDirectory = path.join(repoRoot, "public/audio/forklift");
const decodedFiles = readdirSync(decodedDirectory);

function normalizeWav(input, filename) {
  if (
    input.subarray(0, 4).toString("ascii") !== "RIFF"
    || input.subarray(12, 16).toString("ascii") !== "WAVE"
    || input.subarray(44, 48).toString("ascii") !== "data"
  ) {
    throw new Error(`${filename} does not have DTPKDump's WAV layout`);
  }
  const output = Buffer.concat([
    input.subarray(0, 8),
    input.subarray(12, 24),
    input.subarray(28, 52),
    input.subarray(56),
  ]);
  output.writeUInt32LE(output.length - 8, 4);
  const blockAlign = output.readUInt16LE(22) * output.readUInt16LE(34) / 8;
  output.writeUInt16LE(blockAlign, 32);
  return output;
}

function decodedSample(playbackId, sampleId) {
  const playback = playbackId.toString(16).padStart(2, "0");
  const sample = sampleId.toString(16).padStart(2, "0");
  const markers = [`_SPD_${playback}_Sample_${sample}_`, `_SPD_${
    playbackId.toString(10).padStart(2, "0")
  }_Sample_${sample}_`];
  const candidates = decodedFiles.filter((candidate) => (
    candidate.toLowerCase().endsWith(".wav")
    && !candidate.startsWith("fixed-")
  ));
  const filename = candidates.find((candidate) => (
    markers.some((marker) => candidate.toLowerCase().includes(
      marker.toLowerCase(),
    ))
  )) || candidates.find((candidate) => candidate.toLowerCase().includes(
    `_sample_${sample}_`.toLowerCase(),
  ));
  if (!filename) {
    throw new Error(
      `Decoded playback ${playback}, sample ${sample} was not found`,
    );
  }
  return filename;
}

function encode(input, filename, trim = null) {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "new-yokosuka-forklift-audio-"),
  );
  const inputPath = path.join(temporaryDirectory, "input.wav");
  const outputPath = path.join(temporaryDirectory, filename);
  try {
    writeFileSync(inputPath, input);
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath];
    if (trim) {
      args.push("-ss", String(trim.start), "-t", String(trim.duration));
    }
    args.push(
      "-map_metadata", "-1",
      "-c:a", "libopus", "-b:a", "48k", "-vbr", "on",
      "-application", "lowdelay", outputPath,
    );
    const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `ffmpeg exit ${result.status}`);
    }
    return readFileSync(outputPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

mkdirSync(outputDirectory, { recursive: true });
const assets = [];
for (const track of tracks.filter(({ volume }) => volume > 0)) {
  const samples = playbackSamples.get(track.playbackId);
  if (!samples) throw new Error(`Playback ${track.playbackId} is not mapped`);
  for (const [variant, sampleId] of samples.entries()) {
    const sourceFilename = decodedSample(track.playbackId, sampleId);
    const source = normalizeWav(
      readFileSync(path.join(decodedDirectory, sourceFilename)),
      sourceFilename,
    );
    const sampleRate = playbackRates.get(track.playbackId) || 16000;
    source.writeUInt32LE(sampleRate, 24);
    source.writeUInt32LE(sampleRate * source.readUInt16LE(32), 28);
    const commandHex = `a904${track.track.toString(16).padStart(2, "0")}00`;
    const variantSuffix = samples.length > 1 ? `-v${variant}` : "";
    const filename = `${commandHex}${variantSuffix}.webm`;
    const encoded = encode(source, filename);
    writeFileSync(path.join(outputDirectory, filename), encoded);
    const asset = {
      commandHex,
      track: track.track,
      playbackId: track.playbackId,
      sampleId,
      variant,
      rawVolume: track.volume,
      compositionHex: track.compositionHex,
      sampleRate,
      decodedSource: sourceFilename,
      filename,
      identifiedFunction: identifiedFunctions.get(filename),
      byteLength: encoded.length,
      sha256: sha256(encoded),
    };
    const loop = sampleLoops.get(sampleId);
    if (loop) {
      const loopFilename = `${commandHex}${variantSuffix}-loop.webm`;
      const loopBytes = encode(source, loopFilename, {
        start: loop[0] / sampleRate,
        duration: (loop[1] - loop[0]) / sampleRate,
      });
      writeFileSync(path.join(outputDirectory, loopFilename), loopBytes);
      asset.loop = {
        startSample: loop[0],
        endSample: loop[1],
        filename: loopFilename,
        identifiedFunction: identifiedFunctions.get(loopFilename),
        byteLength: loopBytes.length,
        sha256: sha256(loopBytes),
      };
    }
    assets.push(asset);
  }
}

const stopTracks = tracks.filter(({ volume }) => volume === 0).map((track) => ({
  commandHex: `a904${track.track.toString(16).padStart(2, "0")}00`,
  track: track.track,
  stopsPlaybackId: track.playbackId,
  compositionHex: track.compositionHex,
}));
const manifest = {
  schema: "new-yokosuka-forklift-audio-v1",
  generatedBy: "tools/audio/build_forklift_audio_pack.mjs",
  source: {
    bank: path.relative(repoRoot, bankPath),
    byteLength: bank.length,
    sha256: sha256(bank),
    commandGroup: "a904",
    map: "SCENE/03/MA00/MAPINFO.BIN",
  },
  decoder: {
    repository: "https://github.com/Preppy/dtpkdump",
    command: "python DTPKDump.py -wavconv E1FORKLI.SND",
    wavNormalization: "remove DTPKDump's four 64-bit-size padding words",
  },
  encoding: {
    container: "webm",
    codec: "opus",
    bitRate: 48000,
    loopAssets: "native DTPK loop spans, encoded as seamless standalone clips",
  },
  nativeRuntimeEvidence: {
    engineLayerA: {
      start: "0x001104a9",
      stop: "0x001204a9",
      mapCallOffsets: ["0x21f86", "0x1a2bc"],
    },
    engineLayerB: {
      start: "0x001304a9",
      stop: "0x001404a9",
      mapCallOffsets: ["0x21b28", "0x1a2d4"],
    },
    positionalForklift: {
      start: "0x000d04a9",
      stop: "0x000e04a9",
      mapCallOffsets: [
        "0x1b3e0", "0x1c25c", "0x21c5a", "0x22074",
        "0x1b670", "0x1c368", "0x21d60", "0x22180",
      ],
    },
  },
  assets,
  stopTracks,
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${assets.length} native E1FORKLI assets to ${outputDirectory}.`,
);
