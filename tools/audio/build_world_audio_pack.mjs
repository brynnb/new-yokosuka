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
import surfaceCatalog from "../../play/data/native-footstep-surfaces.json" with {
  type: "json",
};
import {
  NATIVE_FOOTSTEP_SURFACE_COMMANDS,
  nativeFootstepCommand,
} from "../../play/audio/NativeFootstepCommands.js";

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
    "Usage: node tools/audio/build_world_audio_pack.mjs "
    + "<DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(sourceRoot, "data/SOUND/SYSTEM1.SND");
const outputDirectory = path.join(repoRoot, "public/audio/world");
const bank = readFileSync(bankPath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parsedBank = parseDTPK(bank);
const group = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "ab03",
);
if (!group) throw new Error("SYSTEM1.SND does not declare group AB03");
const transitionGroup = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "ab0a",
);
if (!transitionGroup) {
  throw new Error("SYSTEM1.SND does not declare transition group AB0A");
}
const telmControllerGroup = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "ab05",
);
if (!telmControllerGroup) {
  throw new Error("SYSTEM1.SND does not declare TELM controller group AB05");
}
const telmEvidencePath = path.join(
  repoRoot,
  "tools/evidence/native-telm-audio-calls.json",
);
const telmEvidenceBytes = readFileSync(telmEvidencePath);
const telmEvidence = JSON.parse(telmEvidenceBytes);
const mapCallEvidencePath = path.join(
  repoRoot,
  "tools/evidence/native-world-audio-calls.json",
);
const mapCallEvidenceBytes = readFileSync(mapCallEvidencePath);
const mapCallEvidence = JSON.parse(mapCallEvidenceBytes);
const playbackById = new Map(
  parsedBank.playbacks.map((playback) => [playback.playbackId, playback]),
);

function playbackForTrack(track, sourceGroup = group) {
  const parsedTrack = sourceGroup.tracks[track];
  if (!parsedTrack) {
    throw new Error(
      `${sourceGroup.descriptorHex.toUpperCase()} track ${track} is outside `
      + `${sourceGroup.trackCount} tracks`,
    );
  }
  if (
    !parsedTrack.playable
    || parsedTrack.entries.length !== 1
  ) {
    throw new Error(
      `${sourceGroup.descriptorHex.toUpperCase()} track ${track} `
      + "is not a simple playable SFX",
    );
  }
  const entry = parsedTrack.entries[0];
  const playback = playbackById.get(entry.playbackId);
  if (!playback) {
    throw new Error(
      `AB03 track ${track} references missing playback ${entry.playbackId}`,
    );
  }
  return {
    ...playback,
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
    throw new Error(`Decoded SYSTEM1 sample ${marker} was not found`);
  }
  return filename;
}

function encodeWebMOpus(input, commandHex) {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "new-yokosuka-world-audio-"),
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
    // FFmpeg assigns a random Matroska TrackUID on every mux. WebM repeats
    // that UID in its track tag, which made otherwise identical extraction
    // runs produce different artifacts and manifest hashes. Replace both
    // 8-byte values with a stable command-derived UID.
    const uid = createHash("sha256").update(commandHex).digest().subarray(0, 8);
    for (const marker of [
      Buffer.from([0x73, 0xc5, 0x88]), // TrackUID
      Buffer.from([0x63, 0xc5, 0x88]), // TagTrackUID
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
const surfaceIndices = [...new Set([
  1,
  ...Object.values(surfaceCatalog.areas).flatMap(({ records }) => (
    records
      .filter(({ suppressed }) => !suppressed)
      .map(({ surfaceIndex }) => surfaceIndex)
  )),
])].filter((surfaceIndex) => (
  surfaceIndex > 0
  && surfaceIndex < NATIVE_FOOTSTEP_SURFACE_COMMANDS.length
)).sort((left, right) => left - right);
const commands = surfaceIndices.flatMap((surfaceIndex) => (
  Array.from({ length: 4 }, (_, variant) => {
    const commandHex = nativeFootstepCommand({ surfaceIndex, variant });
    const [baseTrack, flags] = NATIVE_FOOTSTEP_SURFACE_COMMANDS[surfaceIndex];
    return {
      surfaceIndex,
      variant,
      track: baseTrack + variant,
      flags,
      commandHex,
    };
  })
));
const tracks = [];
const unsupportedFootstepTracks = [];
for (const {
  surfaceIndex,
  variant,
  track,
  flags,
  commandHex,
} of commands) {
  const parsedTrack = group.tracks[track];
  if (!parsedTrack?.playable || parsedTrack.entries.length !== 1) {
    unsupportedFootstepTracks.push({
      commandHex,
      surfaceIndex,
      variant,
      track,
      flags,
      reason: "joined-or-multi-playback-composition",
      compositionHex: parsedTrack?.compositionHex ?? null,
      operations: parsedTrack?.entries ?? [],
    });
    continue;
  }
  const playback = playbackForTrack(track);
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
    surfaceIndex,
    variant,
    track,
    flags,
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

const transitionDirectory = path.join(outputDirectory, "system1");
mkdirSync(transitionDirectory, { recursive: true });
const transitionTracks = [];
for (const parsedTrack of transitionGroup.tracks) {
  const commandHex = parsedTrack.commandHex;
  const playback = playbackForTrack(parsedTrack.track, transitionGroup);
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
  writeFileSync(
    path.join(transitionDirectory, `${commandHex}.webm`),
    output,
  );
  transitionTracks.push({
    commandHex,
    track: parsedTrack.track,
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

const telmControllerCommands = [...new Set(
  telmEvidence.calls
    .filter(({ commandHex, bankResolution }) => (
      commandHex.startsWith("ab05")
      && bankResolution === "unique-system1-bank"
    ))
    .map(({ commandHex }) => commandHex),
)].sort();
const telmControllerTracks = [];
for (const commandHex of telmControllerCommands) {
  const track = Number.parseInt(commandHex.slice(4, 6), 16);
  const parsedTrack = telmControllerGroup.tracks[track];
  if (!parsedTrack?.playable) {
    throw new Error(`${commandHex} is not a playable AB05 composition`);
  }
  const operations = parsedTrack.entries.map((entry) => {
    const playback = playbackById.get(entry.playbackId);
    if (!playback) {
      throw new Error(
        `${commandHex} references missing playback ${entry.playbackId}`,
      );
    }
    return {
      playbackId: entry.playbackId,
      sampleId: playback.sampleId,
      rawVolume: entry.volume,
      dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
      sampleRate: translateDTPKRate(playback.dtpkRate),
    };
  });
  const audible = operations.filter(({ rawVolume }) => rawVolume > 0);
  if (audible.length > 1) {
    throw new Error(
      `${commandHex} has ${audible.length} simultaneous audible playbacks`,
    );
  }
  if (audible.length === 0) {
    telmControllerTracks.push({
      commandHex,
      track,
      compositionHex: parsedTrack.compositionHex,
      controlOnly: true,
      asset: null,
      operations,
    });
    continue;
  }
  const [operation] = audible;
  const playback = playbackById.get(operation.playbackId);
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
  const output = encodeWebMOpus(pcm, `system1:${commandHex}`);
  writeFileSync(
    path.join(transitionDirectory, `${commandHex}.webm`),
    output,
  );
  telmControllerTracks.push({
    commandHex,
    track,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    rawVolume: operation.rawVolume,
    compositionHex: parsedTrack.compositionHex,
    controlOnly: false,
    asset: `${commandHex}.webm`,
    operations,
    decodedSource: sourceFilename,
    byteLength: output.length,
    sha256: sha256(output),
  });
}

const sharedSystemDirectTracks = [];
for (const {
  commandHex,
  callCount,
} of mapCallEvidence.sharedSystemDirectCommands) {
  const groupHex = commandHex.slice(0, 4);
  const sourceGroup = parsedBank.groups.find(
    ({ descriptorHex }) => descriptorHex === groupHex,
  );
  if (!sourceGroup) {
    throw new Error(`${commandHex} references missing SYSTEM1 group ${groupHex}`);
  }
  const track = Number.parseInt(commandHex.slice(4, 6), 16);
  const parsedTrack = sourceGroup.tracks[track];
  if (!parsedTrack?.playable) {
    throw new Error(`${commandHex} is not a playable SYSTEM1 composition`);
  }
  const operations = parsedTrack.entries.map((entry) => {
    const playback = playbackById.get(entry.playbackId);
    if (!playback) {
      throw new Error(
        `${commandHex} references missing playback ${entry.playbackId}`,
      );
    }
    return {
      playbackId: entry.playbackId,
      sampleId: playback.sampleId,
      rawVolume: entry.volume,
      dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
      sampleRate: translateDTPKRate(playback.dtpkRate),
    };
  });
  const audible = operations.filter(({ rawVolume }) => rawVolume > 0);
  if (audible.length > 1) {
    throw new Error(
      `${commandHex} has ${audible.length} simultaneous audible playbacks`,
    );
  }
  const result = {
    commandHex,
    callCount,
    group: groupHex,
    track,
    compositionHex: parsedTrack.compositionHex,
    controlOnly: audible.length === 0,
    asset: audible.length === 0 ? null : `${commandHex}.webm`,
    operations,
  };
  if (audible.length === 0) {
    sharedSystemDirectTracks.push(result);
    continue;
  }
  const [operation] = audible;
  const playback = playbackById.get(operation.playbackId);
  const sourceFilename = decodedSample(playback.sampleId);
  const sampleRate = translateDTPKRate(playback.dtpkRate);
  if (!sampleRate) {
    throw new Error(
      `Unmapped DTPK rate 0x${playback.dtpkRate.toString(16)}`,
    );
  }
  const pcm = withSampleRate(
    repairedDTPKDumpWav(
      readFileSync(path.join(decodedDirectory, sourceFilename)),
      sourceFilename,
    ),
    sampleRate,
  );
  const output = encodeWebMOpus(pcm, `system1:${commandHex}`);
  writeFileSync(
    path.join(transitionDirectory, `${commandHex}.webm`),
    output,
  );
  sharedSystemDirectTracks.push({
    ...result,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    rawVolume: operation.rawVolume,
    decodedSource: sourceFilename,
    byteLength: output.length,
    sha256: sha256(output),
  });
}

const manifest = {
  schema: "new-yokosuka-world-audio-v1",
  generatedBy: "tools/audio/build_world_audio_pack.mjs",
  source: {
    bank: path.relative(repoRoot, bankPath),
    byteLength: bank.length,
    sha256: sha256(bank),
    commandGroup: "ab03",
    transitionCommandGroup: "ab0a",
    telmControllerCommandGroup: "ab05",
    telmControllerEvidence: path.relative(repoRoot, telmEvidencePath),
    telmControllerEvidenceSha256: sha256(telmEvidenceBytes),
    mapCallEvidence: path.relative(repoRoot, mapCallEvidencePath),
    mapCallEvidenceSha256: sha256(mapCallEvidenceBytes),
    nativeSurfaceTable: "1ST_READ.BIN 0x0c29c068",
    nativeResolver: "FUN_0c17bb14",
  },
  decoder: {
    repository: "https://github.com/Preppy/dtpkdump",
    command: "python DTPKDump.py -wavconv SYSTEM1.SND",
    wavNormalization: "remove DTPKDump's four 64-bit-size padding words",
  },
  encoding: {
    container: "webm",
    codec: "opus",
    bitRate: 48000,
    variableBitRate: true,
    application: "lowdelay",
  },
  purpose: (
    "native free-roam STEP surfaces, shared map transitions, and "
    + "source-proven shared SYSTEM1 map commands"
  ),
  surfaceIndices,
  tracks,
  unsupportedFootstepTracks,
  transitionTracks,
  telmControllerTracks,
  sharedSystemDirectTracks,
  telmControllerRuntimeStatus: (
    "packaged but unwired pending exact numeric-state interaction semantics"
  ),
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${tracks.length} native SYSTEM1 footstep tracks and ${
    transitionTracks.length
  } transition, ${telmControllerTracks.length} TELM controller tracks, and ${
    sharedSystemDirectTracks.length
  } direct shared-system tracks `
  + `to ${outputDirectory}.`,
);
