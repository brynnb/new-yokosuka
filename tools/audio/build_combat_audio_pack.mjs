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
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
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
    "Usage: node tools/audio/build_combat_audio_pack.mjs "
    + "<DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/03/SOUND/BATTLE_1.SND",
);
const outputDirectory = path.join(repoRoot, "public/audio/combat");
const manifestPath = path.join(outputDirectory, "manifest.json");
const bank = readFileSync(bankPath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (bank.subarray(0, 4).toString("ascii") !== "DTPK") {
  throw new Error(`${bankPath} is not a DTPK bank`);
}

const sequenceOffset = bank.readUInt32LE(0x2c);
const playbackOffset = bank.readUInt32LE(0x30);
const groupCount = bank.readUInt32LE(sequenceOffset) + 1;
const groups = Array.from({ length: groupCount }, (_, index) => {
  const descriptorWord = bank.readUInt32LE(sequenceOffset + 4 + index * 4);
  const descriptor = descriptorWord >>> 16;
  const trackCountOffset = descriptorWord & 0xffff;
  const nextDescriptorWord = index + 1 < groupCount
    ? bank.readUInt32LE(sequenceOffset + 4 + (index + 1) * 4)
    : playbackOffset - sequenceOffset;
  const groupEndOffset = nextDescriptorWord & 0xffff;
  const trackCount = bank.readUInt32LE(
    sequenceOffset + trackCountOffset,
  ) + 1;
  const tracks = Array.from({ length: trackCount }, (_, track) => {
    const relativeStart = bank.readUInt32LE(
      sequenceOffset + trackCountOffset + 4 + track * 4,
    );
    let relativeEnd = track + 1 < trackCount
      ? bank.readUInt32LE(
        sequenceOffset + trackCountOffset + 4 + (track + 1) * 4,
      )
      : groupEndOffset;
    while (
      relativeEnd > relativeStart
      && bank[sequenceOffset + relativeEnd - 1] === 0
    ) {
      relativeEnd -= 1;
    }
    const bytes = bank.subarray(
      sequenceOffset + relativeStart,
      sequenceOffset + relativeEnd,
    );
    if (bytes.length < 5 || bytes.at(-1) !== 0xff) {
      throw new Error(
        `Malformed DTPK group ${index} track ${track} composition`,
      );
    }
    if (bytes[1] === 0xa0) {
      return {
        track,
        playable: false,
        compositionHex: bytes.toString("hex"),
      };
    }
    if (![0xdc, 0xdd, 0xde, 0xdf].includes(bytes[1])) {
      throw new Error(
        `Unsupported DTPK group ${index} track ${track} type ${
          bytes[1].toString(16)
        }`,
      );
    }
    if (bytes.length !== 6 || (bytes[4] & 0x80) === 0) {
      throw new Error(
        `Joined/extended DTPK group ${index} track ${track} needs parsing`,
      );
    }
    return {
      track,
      playable: true,
      playbackId: bytes[2] + ((bytes[4] & 0x0f) * 0x80),
      volume: bytes[3],
      compositionHex: bytes.toString("hex"),
    };
  });
  return {
    index,
    descriptor,
    commandPrefixHex: descriptor.toString(16).padStart(4, "0"),
    trackCount,
    tracks,
  };
});

const playbackCount = bank.readUInt16LE(playbackOffset + 0x10) + 1;
const playbacks = Array.from({ length: playbackCount }, (_, index) => {
  const offset = playbackOffset + 0x50 + index * 0x40;
  const storedId = bank[offset];
  if (storedId !== (index & 0xff)) {
    throw new Error(
      `Playback ${index} stores unexpected low ID ${storedId}`,
    );
  }
  return {
    playbackId: index,
    sampleId: bank[offset + 2],
    dtpkRate: bank.readUInt16BE(offset + 10),
  };
});

// Exact conversion used by the pinned DTPKDump decoder. DTPK's 16-bit rate
// combines AICA pitch, base-note, transposition, and detune fields; the decoder
// maps observed composite values to the nearest proven native sample rate.
const dtpkRatePairs = [
  [4000, 0xd61d], [6000, 0xdd1e], [6500, 0xde36],
  [7000, 0xe008], [8000, 0xe21d], [8012, 0xe21e],
  [8500, 0xe320], [9000, 0xe41f], [9500, 0xe51c],
  [10500, 0xe70a], [11025, 0xe800], [12000, 0xe91e],
  [12500, 0xea0b], [13000, 0xea36], [14000, 0xec08],
  [15000, 0xed15], [16000, 0xee1d], [17000, 0xef20],
  [18000, 0xf01f], [19000, 0xf11c], [20000, 0xf214],
  [21000, 0xf30a], [22050, 0xf400], [23000, 0xf42f],
  [24000, 0xf4f6], [25000, 0xf600], [26000, 0xf71d],
  [28000, 0xf800], [30000, 0xf900], [32000, 0xfa13],
  [34000, 0xfb00], [35000, 0xfc1d], [38000, 0xfd15],
  [40000, 0xfe1d], [42000, 0xff00],
];
function translateDTPKRate(rate) {
  if (rate < 0x600) {
    for (const [sampleRate, dtpkRate] of [
      [44100, 0x0000],
      [45000, 0x0100],
      [46000, 0x0200],
      [47000, 0x0300],
      [48000, 0x0400],
      [49000, 0x0500],
    ]) {
      if (rate === dtpkRate || rate < dtpkRate) return sampleRate;
    }
    return 44100;
  }
  if (rate <= 0xd000) {
    throw new Error(`Unsupported DTPK rate 0x${rate.toString(16)}`);
  }
  for (const [sampleRate, dtpkRate] of dtpkRatePairs) {
    if (rate === dtpkRate || rate < dtpkRate + 0x20) return sampleRate;
  }
  throw new Error(`Unmapped DTPK rate 0x${rate.toString(16)}`);
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
  const sampleRate = output.readUInt32LE(24);
  const bitsPerSample = output.readUInt16LE(34);
  const blockAlign = channels * bitsPerSample / 8;
  const dataLength = output.readUInt32LE(40);
  if (
    output.subarray(8, 12).toString("ascii") !== "WAVE"
    || output.subarray(12, 16).toString("ascii") !== "fmt "
    || output.subarray(36, 40).toString("ascii") !== "data"
    || output.length !== 44 + dataLength
    || !Number.isInteger(blockAlign)
  ) {
    throw new Error(`${filename} could not be normalized to PCM WAV`);
  }
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
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

const opusEncoding = Object.freeze({
  container: "webm",
  codec: "opus",
  bitRate: 48_000,
  variableBitRate: true,
  application: "lowdelay",
  frameDurationMilliseconds: 10,
});

function encodeWebMOpus(input, commandHex) {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "new-yokosuka-combat-opus-"),
  );
  const inputPath = path.join(temporaryDirectory, `${commandHex}.wav`);
  const outputPath = path.join(temporaryDirectory, `${commandHex}.webm`);
  try {
    writeFileSync(inputPath, input);
    const encoded = spawnSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-c:a",
      "libopus",
      "-b:a",
      "48k",
      "-vbr",
      "on",
      "-application",
      "lowdelay",
      "-frame_duration",
      "10",
      outputPath,
    ], {
      encoding: "utf8",
    });
    if (encoded.error || encoded.status !== 0 || !existsSync(outputPath)) {
      throw new Error(
        `FFmpeg failed for ${commandHex}: ${
          encoded.error?.message || encoded.stderr || `status ${encoded.status}`
        }`,
      );
    }
    const output = readFileSync(outputPath);
    if (
      output.length < 4
      || output.readUInt32BE(0) !== 0x1a45dfa3
    ) {
      throw new Error(`${commandHex} did not encode as a WebM container`);
    }
    return output;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const decodedPattern =
  /^BATTLE_1_(\d{2})_(\d{2})_SPD_(\d+)_Sample_([0-9A-F]+)_Rate_([0-9A-F]+)\.wav$/i;
mkdirSync(outputDirectory, { recursive: true });

const decodedSamples = new Map();
for (const filename of readdirSync(decodedDirectory).sort()) {
  const match = filename.match(decodedPattern);
  if (!match) continue;
  const sampleId = Number.parseInt(match[4], 16);
  const normalized = repairedDTPKDumpWav(
    readFileSync(path.join(decodedDirectory, filename)),
    filename,
  );
  const existing = decodedSamples.get(sampleId);
  if (
    existing
    && !existing.subarray(44).equals(normalized.subarray(44))
  ) {
    throw new Error(`Decoded sample ${sampleId} has conflicting PCM payloads`);
  }
  decodedSamples.set(sampleId, normalized);
}

const expectedOutputNames = new Set();
for (const group of groups) {
  for (const track of group.tracks) {
    if (!track.playable) continue;
    const playback = playbacks[track.playbackId];
    if (!playback) {
      throw new Error(
        `Group ${group.index} track ${track.track} references missing playback ${
          track.playbackId
        }`,
      );
    }
    const decoded = decodedSamples.get(playback.sampleId);
    if (!decoded) {
      throw new Error(
        `Playback ${playback.playbackId} references undecoded sample ${
          playback.sampleId
        }`,
      );
    }
    const commandHex = `${group.commandPrefixHex}${
      track.track.toString(16).padStart(2, "0")
    }00`;
    const outputName = `${commandHex}.webm`;
    const sampleRate = translateDTPKRate(playback.dtpkRate);
    const normalizedPcm = withSampleRate(decoded, sampleRate);
    const output = encodeWebMOpus(normalizedPcm, commandHex);
    expectedOutputNames.add(outputName);
    writeFileSync(path.join(outputDirectory, outputName), output);
    Object.assign(track, {
      commandHex,
      url: `/audio/combat/${outputName}`,
      playbackId: playback.playbackId,
      sampleId: playback.sampleId,
      dtpkRate: playback.dtpkRate,
      nativeSampleRate: sampleRate,
      sourceChannels: normalizedPcm.readUInt16LE(22),
      sourceBitsPerSample: normalizedPcm.readUInt16LE(34),
      encoding: opusEncoding,
      byteLength: output.length,
      sha256: sha256(output),
    });
  }
  group.playableTrackCount = group.tracks.filter(
    (track) => track.playable,
  ).length;
  group.nullTracks = group.tracks.filter(
    (track) => !track.playable,
  ).map((track) => track.track);
}
for (const filename of readdirSync(outputDirectory)) {
  if (
    /^ab[0-9a-f]{6}\.(?:wav|webm)$/i.test(filename)
    && !expectedOutputNames.has(filename)
  ) {
    unlinkSync(path.join(outputDirectory, filename));
  }
}

const manifest = {
  schema: "new-yokosuka-combat-audio-v3",
  generatedBy: "tools/audio/build_combat_audio_pack.mjs",
  source: {
    bank: path.relative(repoRoot, bankPath),
    byteLength: bank.length,
    sha256: sha256(bank),
    decoder: {
      repository: "https://github.com/Preppy/dtpkdump",
      commit: "a323c0e7e80af05e17e5bb291a9b20e55a3f9455",
      command: "python DTPKDump.py -wavconv BATTLE_1.SND",
      normalization:
        "Repairs Python array('l') 64-bit WAV padding, then reconstructs "
        + "every command through native track -> playback -> sample/rate data.",
    },
    encoder: {
      executable: "ffmpeg",
      command:
        "-c:a libopus -b:a 48k -vbr on -application lowdelay "
        + "-frame_duration 10",
      ...opusEncoding,
    },
  },
  commandFormat: "AB GG TT 00 (DTPK group descriptor and track)",
  playbackCount,
  uniqueDecodedSampleCount: decodedSamples.size,
  groups,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${manifestPath}: ${groups.length} groups, ${
    groups.reduce((sum, group) => sum + group.playableTrackCount, 0)
  } playable tracks.`,
);
